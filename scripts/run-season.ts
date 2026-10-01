/*
 * Runs the full demo "season" end to end with the same code the website uses:
 *   scrape (Apify) → read + analyze (Grok) → speed-date every pair → invitations → real dates → rankings
 * Every step is cached in data/cache so the run can be resumed.
 *
 *   npm run season                 # everything
 *   npm run season -- --limit 6    # quick test with the first 6 people
 *   npm run season -- --stage scrape|analyze|speed|dates|write
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

try {
  process.loadEnvFile(".env.local");
} catch {}

import {
  fetchImage,
  normalizeInstagram,
  normalizeLinkedIn,
  parseInstagramUrl,
  parseLinkedInUrl,
  runToCompletion,
} from "../lib/apify";
import { analyzePerson, readPerson, type PostImage } from "../lib/analyze";
import { drain, runFullDate, runInvitation, runSpeedDate } from "../lib/dating";
import { modelLabel, usage } from "../lib/llm";
import { forecast, pairKey } from "../lib/ranking";
import type { Analysis, FullDate, Invitation, Person, RawSources, ReadingNote, SpeedDate } from "../lib/types";
import { firstNameOf, hasInvitationBetween, pickInvites, pool, slugify, toAgent } from "../lib/util";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = Number(arg("limit") || 0);
const STAGE = arg("stage") || "all";
const TARGET = Number(arg("target") || 25);
// Free-tier friendly: each agent speed-dates its K most promising matches (by matchmaker forecast); 0 = everyone.
const SPEED_K = Number(arg("speed-k") ?? 8);
const INVITES = Number(arg("invites") ?? 2);

const ROOT = process.cwd();
const CACHE = path.join(ROOT, "data/cache");
const OUT = path.join(ROOT, "public/season");
for (const d of ["raw", "notes", "analysis", "speed", "inv", "date"]) fs.mkdirSync(path.join(CACHE, d), { recursive: true });
fs.mkdirSync(path.join(OUT, "raw"), { recursive: true });
fs.mkdirSync(path.join(OUT, "img"), { recursive: true });

const readJson = <T>(p: string): T | null => (fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null);
const writeJson = (p: string, v: unknown) => fs.writeFileSync(p, JSON.stringify(v, null, 1));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

interface SeedPerson {
  name: string;
  linkedin: string;
  instagram: string;
}

// ---------- 1. Scrape ----------

async function scrape(seed: SeedPerson): Promise<RawSources | null> {
  const id = slugify(seed.name);
  const cached = readJson<RawSources | { error: string }>(path.join(CACHE, "raw", `${id}.json`));
  if (cached) return "error" in cached ? null : cached;
  const li = parseLinkedInUrl(seed.linkedin);
  const ig = parseInstagramUrl(seed.instagram);
  if (!li || !ig) throw new Error(`bad links for ${seed.name}`);
  log(`scraping ${seed.name}…`);
  try {
    const [liItems, postItems, igItems] = await Promise.all([
      runToCompletion("linkedinProfile", li.url),
      runToCompletion("linkedinPosts", li.url).catch((e) => {
        log(`  ! posts failed for ${seed.name}: ${e.message}`);
        return [];
      }),
      runToCompletion("instagram", ig.username),
    ]);
    const linkedin = normalizeLinkedIn(li.url, liItems[0], postItems);
    const instagram = normalizeInstagram(ig.url, igItems[0]);
    let error = "";
    if (!liItems[0] || linkedin.name === "Unknown") error = "LinkedIn profile not found";
    else if (!igItems[0] || !instagram.username) error = "Instagram profile not found";
    else if (instagram.isPrivate) error = "Instagram is private";
    else if (instagram.posts.length < 3) error = "Instagram has too few public posts";
    if (error) {
      log(`  ✗ ${seed.name}: ${error}`);
      writeJson(path.join(CACHE, "raw", `${id}.json`), { error });
      return null;
    }
    const raw: RawSources = { linkedin, instagram, scrapedAt: new Date().toISOString() };
    writeJson(path.join(CACHE, "raw", `${id}.json`), raw);
    log(`  ✓ ${seed.name}: ${linkedin.experience.length} roles, ${linkedin.posts.length} LI posts, ${instagram.posts.length} IG posts`);
    return raw;
  } catch (e) {
    log(`  ✗ ${seed.name}: ${(e as Error).message}`);
    return null;
  }
}

// ---------- 2. Images (stable local copies; IG CDN links expire) ----------

function resize(file: string, max: number) {
  try {
    execFileSync("sips", ["-Z", String(max), "-s", "format", "jpeg", file, "--out", file], { stdio: "ignore" });
  } catch {}
}

async function saveImage(url: string | undefined, file: string, max: number): Promise<boolean> {
  if (fs.existsSync(file)) return true;
  if (!url) return false;
  const img = await fetchImage(url, 8_000_000);
  if (!img) return false;
  fs.writeFileSync(file, img.bytes);
  resize(file, max);
  return true;
}

async function localizeImages(id: string, raw: RawSources): Promise<{ avatar?: string; images: PostImage[] }> {
  const dir = path.join(OUT, "img", id);
  fs.mkdirSync(dir, { recursive: true });
  const avatarFile = path.join(dir, "avatar.jpg");
  const okAvatar =
    (await saveImage(raw.instagram.profilePicUrl, avatarFile, 320)) || (await saveImage(raw.linkedin.photoUrl, avatarFile, 320));
  const images: PostImage[] = [];
  await pool(raw.instagram.posts, 4, async (p) => {
    const f = path.join(dir, `${p.ref}.jpg`);
    if (await saveImage(p.imageUrl, f, 560)) {
      p.image = `/season/img/${id}/${p.ref}.jpg`;
    }
  });
  for (const p of raw.instagram.posts.slice(0, 8)) {
    const f = path.join(dir, `${p.ref}.jpg`);
    if (p.image && fs.existsSync(f)) images.push({ ref: p.ref, dataUrl: `data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}` });
  }
  return { avatar: okAvatar ? `/season/img/${id}/avatar.jpg` : undefined, images: images.slice(0, 6) };
}

// ---------- 3. Read + analyze ----------

async function analyze(id: string, raw: RawSources, images: PostImage[]): Promise<{ notes: ReadingNote[]; analysis: Analysis }> {
  let notes = readJson<ReadingNote[]>(path.join(CACHE, "notes", `${id}.json`));
  if (!notes) {
    notes = [];
    for await (const n of readPerson(raw, images)) notes.push(n);
    writeJson(path.join(CACHE, "notes", `${id}.json`), notes);
  }
  let analysis = readJson<Analysis>(path.join(CACHE, "analysis", `${id}.json`));
  if (!analysis) {
    analysis = await analyzePerson(raw, notes);
    writeJson(path.join(CACHE, "analysis", `${id}.json`), analysis);
  }
  return { notes, analysis };
}

// ---------- main ----------

async function main() {
  const seeds = JSON.parse(fs.readFileSync(path.join(ROOT, "data/people.json"), "utf8")) as SeedPerson[];
  const list = LIMIT ? seeds.slice(0, LIMIT) : seeds;
  log(`season: ${list.length} candidates, target ${LIMIT || TARGET}, model ${modelLabel()}`);

  // 1. scrape one person at a time (each person = 3 Apify runs; free plans allow 5 concurrent runs)
  const raws = await pool(list, 1, async (s) => ({ seed: s, raw: await scrape(s) }));
  const valid = raws.filter((r): r is { seed: SeedPerson; raw: RawSources } => !!r.raw).slice(0, LIMIT || TARGET);
  log(`scraped: ${valid.length} valid people`);
  if (STAGE === "scrape") return;

  // 2-3. images + analysis
  const people: Person[] = await pool(valid, 4, async ({ seed, raw }) => {
    const id = slugify(seed.name);
    const { avatar, images } = await localizeImages(id, raw);
    log(`reading ${seed.name} (${images.length} photos)…`);
    const { notes, analysis } = await analyze(id, raw, images);
    writeJson(path.join(OUT, "raw", `${id}.json`), raw);
    return {
      id,
      name: seed.name,
      firstName: firstNameOf(seed.name),
      linkedinUrl: raw.linkedin.url,
      instagramUrl: raw.instagram.url,
      avatar,
      interestedIn: "anyone",
      origin: "season",
      createdAt: raw.scrapedAt,
      notes,
      analysis,
      stats: {
        linkedinFollowers: raw.linkedin.followers,
        instagramFollowers: raw.instagram.followers,
        linkedinPosts: raw.linkedin.posts.length,
        instagramPosts: raw.instagram.posts.length,
        experiences: raw.linkedin.experience.length,
      },
    } satisfies Person;
  });
  log(`analyzed ${people.length} people`);
  if (STAGE === "analyze") return write(people, [], [], []);

  // 4. speed dating — the matchmaker seats every agent with its K most promising matches (or everyone)
  const pairs: [Person, Person][] = [];
  const seen = new Set<string>();
  for (const p of people) {
    const ranked = people
      .filter((q) => q.id !== p.id)
      .map((q) => ({ q, f: forecast(p.analysis, q.analysis).score }))
      .sort((x, y) => y.f - x.f)
      .slice(0, SPEED_K > 0 ? SPEED_K : undefined);
    for (const { q } of ranked) {
      const k = pairKey(p.id, q.id);
      if (seen.has(k)) continue;
      seen.add(k);
      const [a, b] = people.indexOf(p) < people.indexOf(q) ? [p, q] : [q, p];
      pairs.push([a, b]);
    }
  }
  log(`speed dating: ${pairs.length} tables`);
  let done = 0;
  const speedDates: SpeedDate[] = await pool(pairs, Number(process.env.SPEED_CONCURRENCY || 6), async ([a, b], i) => {
    const file = path.join(CACHE, "speed", `${a.id}__${b.id}.json`);
    let sd = readJson<SpeedDate>(file);
    if (!sd) {
      for (let attempt = 0; attempt < 3 && !sd; attempt++) {
        try {
          sd = await drain(runSpeedDate(toAgent(a), toAgent(b), (i % 12) + 1), (e) => (e.type === "speed-done" ? e.speedDate : undefined));
        } catch (e) {
          log(`  ! speed ${a.id}×${b.id} attempt ${attempt + 1}: ${(e as Error).message}`);
        }
      }
      if (!sd) throw new Error(`speed date failed: ${a.id} × ${b.id}`);
      writeJson(file, sd);
    }
    done++;
    if (done % 10 === 0 || done === pairs.length) log(`speed dates ${done}/${pairs.length} · llm calls ${usage.calls}`);
    return sd;
  });
  if (STAGE === "speed") return write(people, speedDates, [], []);

  // 5. invitations — each agent asks out its top picks
  const invitations: Invitation[] = [];
  const invite = async (from: Person, to: Person, sd?: SpeedDate) => {
    const file = path.join(CACHE, "inv", `${from.id}__${to.id}.json`);
    let inv = readJson<Invitation>(file);
    if (!inv) {
      inv = await runInvitation(toAgent(from), toAgent(to), sd);
      writeJson(file, inv);
    }
    invitations.push(inv);
    log(`  💌 ${from.firstName} → ${to.firstName}: ${inv.accepted ? "accepted" : "declined"}`);
    return inv;
  };
  const sdFor = (a: string, b: string) => speedDates.find((s) => pairKey(s.a, s.b) === pairKey(a, b));
  const byId = new Map(people.map((p) => [p.id, p]));
  const wanted: [Person, Person][] = [];
  for (const p of people) for (const q of pickInvites(p, people, speedDates, INVITES)) wanted.push([p, byId.get(q)!]);
  // mutual top picks become one invitation (from whoever's turn comes first)
  const queued: [Person, Person][] = [];
  for (const [p, q] of wanted) if (!queued.some(([x, y]) => pairKey(x.id, y.id) === pairKey(p.id, q.id))) queued.push([p, q]);
  await pool(queued, 6, ([p, q]) => invite(p, q, sdFor(p.id, q.id)));
  // everyone gets at least one real date
  for (const p of people) {
    let tries = 0;
    while (!invitations.some((i) => i.accepted && (i.from === p.id || i.to === p.id)) && tries < 4) {
      const exclude = new Set(invitations.filter((i) => i.from === p.id || i.to === p.id).flatMap((i) => [i.from, i.to]));
      const next = pickInvites(p, people, speedDates, 1, exclude)[0];
      if (!next) break;
      if (!hasInvitationBetween(invitations, p.id, next)) await invite(p, byId.get(next)!, sdFor(p.id, next));
      tries++;
    }
  }
  log(`invitations: ${invitations.length}, accepted ${invitations.filter((i) => i.accepted).length}`);

  // 6. real dates
  const accepted = invitations.filter((i) => i.accepted);
  let dd = 0;
  const dates: FullDate[] = (
    await pool(accepted, Number(process.env.DATE_CONCURRENCY || 3), async (inv) => {
      const file = path.join(CACHE, "date", `${inv.from}__${inv.to}.json`);
      let fd = readJson<FullDate>(file);
      if (!fd) {
        for (let attempt = 0; attempt < 2 && !fd; attempt++) {
          try {
            fd = await drain(runFullDate(toAgent(byId.get(inv.from)!), toAgent(byId.get(inv.to)!), inv, sdFor(inv.from, inv.to)), (e) =>
              e.type === "date-done" ? e.date : undefined,
            );
          } catch (e) {
            log(`  ! date ${inv.from}×${inv.to}: ${(e as Error).message}`);
          }
        }
        if (fd) writeJson(file, fd);
      }
      dd++;
      log(`real dates ${dd}/${accepted.length}${fd ? ` · "${fd.title}" ${fd.mutual ? "💞 mutual" : ""}` : " (failed)"}`);
      return fd;
    })
  ).filter((x): x is FullDate => !!x);

  write(people, speedDates, invitations, dates);
}

function write(people: Person[], speedDates: SpeedDate[], invitations: Invitation[], dates: FullDate[]) {
  const season = {
    generatedAt: new Date().toISOString(),
    model: modelLabel(),
    people,
    speedDates,
    invitations,
    dates,
  };
  writeJson(path.join(OUT, "season.json"), season);
  log(
    `wrote public/season/season.json — ${people.length} people, ${speedDates.length} speed dates, ${invitations.length} invitations, ${dates.length} dates, ${dates.filter((d) => d.mutual).length} mutual · llm calls ${usage.calls}, tokens in ${usage.input} out ${usage.output}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
