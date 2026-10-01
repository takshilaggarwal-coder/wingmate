"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/components/store";
import { ReadingView } from "@/components/reading";
import { ChatView } from "@/components/chat";
import { RankingList } from "@/components/ranking";
import { Avatar, Card, SourceBadge, Tag, Typing, cx, fmt } from "@/components/ui";
import { pool, postJson, streamNdjson } from "@/lib/client";
import type { Analysis, AnalyzeEvent, ChatLine, DateEvent, FullDate, InterestedIn, Invitation, Person, RawSources, ReadingNote, SpeedDate } from "@/lib/types";
import { firstNameOf, pickInvites, slugify, toAgent } from "@/lib/util";
import { forecast } from "@/lib/ranking";

type Stage = "form" | "scraping" | "reading" | "speed" | "invites" | "dates" | "done";
type RunStatus = Record<"linkedinProfile" | "linkedinPosts" | "instagram", string>;
type Table = { other: Person; status: "waiting" | "live" | "done" | "error"; lines: ChatLine[]; sd?: SpeedDate };
type LiveDate = { inv: Invitation; a: Person; b: Person; status: "waiting" | "live" | "done" | "error"; lines: ChatLine[]; title?: string; date?: FullDate; note?: string };

const STAGES: [Stage, string][] = [
  ["scraping", "Scrape"],
  ["reading", "Read"],
  ["speed", "Speed-date"],
  ["invites", "Ask out"],
  ["dates", "Real dates"],
  ["done", "Ranking"],
];

function Stepper({ stage }: { stage: Stage }) {
  const idx = STAGES.findIndex(([s]) => s === stage);
  return (
    <div className="no-scrollbar mb-8 flex items-center gap-2 overflow-x-auto">
      {STAGES.map(([s, label], i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={cx("flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm", i < idx ? "bg-mint-soft text-mint" : i === idx ? "bg-ink text-white" : "bg-white text-muted")}>
            <span className="font-semibold">{i < idx ? "✓" : i + 1}</span> {label}
          </div>
          {i < STAGES.length - 1 && <div className="h-px w-5 bg-line" />}
        </div>
      ))}
    </div>
  );
}

const STATUS_ICON: Record<string, string> = { READY: "⏳", RUNNING: "🔄", SUCCEEDED: "✅", FAILED: "❌", "TIMED-OUT": "⌛", ABORTED: "⛔" };

export default function JoinPage() {
  const store = useStore();
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [interestedIn, setInterestedIn] = useState<InterestedIn>("anyone");
  const [withSeason, setWithSeason] = useState(true);
  const [tableCount, setTableCount] = useState(10);
  const [health, setHealth] = useState<{ apify: boolean; llm: boolean; model: string } | null>(null);

  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [raw, setRaw] = useState<RawSources | null>(null);
  const [notes, setNotes] = useState<ReadingNote[]>([]);
  const [readStatus, setReadStatus] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [dates, setDates] = useState<LiveDate[]>([]);
  const started = useRef(0);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ apify: false, llm: false, model: "" }));
  }, []);

  useEffect(() => {
    if (stage === "form" || stage === "done") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [stage]);

  const fail = (e: unknown) => setError((e as Error).message || String(e));

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    started.current = Date.now();
    setStage("scraping");
    try {
      // 1. Scrape both sources with Apify
      const startRes = await postJson<{ runs: RunStatus; li: { url: string }; ig: { url: string } }>("/api/scrape/start", { linkedin, instagram });
      let scraped: { raw: RawSources; avatar?: string } | null = null;
      for (let i = 0; i < 120 && !scraped; i++) {
        const s = await postJson<{ done: boolean; status: RunStatus; raw?: RawSources; avatar?: string; error?: string }>("/api/scrape/status", startRes);
        setRunStatus(s.status);
        if (s.error) throw new Error(s.error);
        if (s.done && s.raw) scraped = { raw: s.raw, avatar: s.avatar };
        else await new Promise((r) => setTimeout(r, 2500));
      }
      if (!scraped) throw new Error("Scraping took too long. Try again.");
      setRaw(scraped.raw);

      // 2. The agent reads both sources
      setStage("reading");
      let analysis: Analysis | null = null;
      const collected: ReadingNote[] = [];
      await streamNdjson<AnalyzeEvent>("/api/analyze", { raw: scraped.raw }, (ev) => {
        if (ev.type === "status") setReadStatus(ev.message);
        if (ev.type === "note") {
          collected.push(ev.note);
          setNotes([...collected]);
        }
        if (ev.type === "analysis") analysis = ev.analysis;
      });
      if (!analysis) throw new Error("The agent couldn't finish the read.");
      const name = scraped.raw.linkedin.name !== "Unknown" ? scraped.raw.linkedin.name : scraped.raw.instagram.fullName || scraped.raw.instagram.username;
      const existing = store.local.people.find((p) => p.linkedinUrl === scraped!.raw.linkedin.url);
      const me: Person = {
        id: existing?.id || `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        firstName: firstNameOf(name),
        linkedinUrl: scraped.raw.linkedin.url,
        instagramUrl: scraped.raw.instagram.url,
        avatar: scraped.avatar,
        interestedIn,
        origin: "local",
        createdAt: new Date().toISOString(),
        notes: collected,
        analysis,
        raw: scraped.raw,
        stats: {
          linkedinFollowers: scraped.raw.linkedin.followers,
          instagramFollowers: scraped.raw.instagram.followers,
          linkedinPosts: scraped.raw.linkedin.posts.length,
          instagramPosts: scraped.raw.instagram.posts.length,
          experiences: scraped.raw.linkedin.experience.length,
        },
      };
      if (existing) store.removeLocalPerson(existing.id);
      store.addPerson(me);
      setPerson(me);

      // 3. Speed-date everyone in the pool
      // The matchmaker seats the most promising agents first (free-tier friendly); "all" meets everyone.
      const poolPeople = store.people
        .filter((p) => p.id !== me.id && p.id !== existing?.id && (withSeason || p.origin === "local"))
        .map((p) => ({ p, f: forecast(me.analysis, p.analysis).score }))
        .sort((x, y) => y.f - x.f)
        .slice(0, tableCount >= 999 ? undefined : tableCount)
        .map((x) => x.p);
      if (!poolPeople.length) {
        setStage("done");
        return;
      }
      setStage("speed");
      const tbl: Table[] = poolPeople.map((o) => ({ other: o, status: "waiting", lines: [] }));
      setTables([...tbl]);
      const speedDates: SpeedDate[] = [];
      await pool(tbl, 3, async (t, i) => {
        t.status = "live";
        setTables([...tbl]);
        try {
          await streamNdjson<DateEvent>("/api/speed-date", { a: toAgent(me), b: toAgent(t.other), table: i + 1 }, (ev) => {
            if (ev.type === "line") {
              t.lines = [...t.lines, ev.line];
              setTables([...tbl]);
            }
            if (ev.type === "speed-done") {
              t.sd = ev.speedDate;
              speedDates.push(ev.speedDate);
              store.addSpeedDate(ev.speedDate);
            }
          });
          t.status = t.sd ? "done" : "error";
        } catch {
          t.status = "error";
        }
        setTables([...tbl]);
      });

      // 4. Invitations: my agent asks out its top 3; agents who loved meeting me ask me out too
      setStage("invites");
      const everyone = [me, ...poolPeople];
      const mine = pickInvites(me, everyone, speedDates, 3);
      const theirs = speedDates
        .map((s) => {
          const otherId = s.a === me.id ? s.b : s.a;
          const r = s.ratings[otherId];
          return { otherId, r };
        })
        .filter((x) => x.r && x.r.wantsDate && x.r.score >= 8 && !mine.includes(x.otherId))
        .sort((x, y) => y.r!.score - x.r!.score)
        .slice(0, 2)
        .map((x) => x.otherId);
      const byId = new Map(everyone.map((p) => [p.id, p]));
      const pairs: [Person, Person][] = [...mine.map((id) => [me, byId.get(id)!] as [Person, Person]), ...theirs.map((id) => [byId.get(id)!, me] as [Person, Person])];
      const invs: Invitation[] = [];
      await pool(pairs, 3, async ([from, to]) => {
        const sd = speedDates.find((s) => (s.a === from.id && s.b === to.id) || (s.a === to.id && s.b === from.id));
        try {
          const inv = await postJson<Invitation>("/api/invite", { from: toAgent(from), to: toAgent(to), speedDate: sd });
          invs.push(inv);
          store.addInvitation(inv);
          setInvites([...invs]);
        } catch {}
      });

      // 5. Real dates for every accepted invitation
      setStage("dates");
      const accepted = invs.filter((i) => i.accepted).slice(0, 4);
      const live: LiveDate[] = accepted.map((inv) => ({ inv, a: byId.get(inv.from)!, b: byId.get(inv.to)!, status: "waiting", lines: [] }));
      setDates([...live]);
      await pool(live, 2, async (d) => {
        d.status = "live";
        setDates([...live]);
        const sd = speedDates.find((s) => (s.a === d.a.id && s.b === d.b.id) || (s.a === d.b.id && s.b === d.a.id));
        try {
          await streamNdjson<DateEvent>("/api/date", { a: toAgent(d.a), b: toAgent(d.b), invitation: d.inv, speedDate: sd }, (ev) => {
            if (ev.type === "plan") d.title = ev.title;
            if (ev.type === "status") d.note = ev.message;
            if (ev.type === "line") d.lines = [...d.lines, ev.line];
            if (ev.type === "date-done") {
              d.date = ev.date;
              store.addDate(ev.date);
            }
            setDates([...live]);
          });
          d.status = d.date ? "done" : "error";
        } catch {
          d.status = "error";
        }
        setDates([...live]);
      });
      setStage("done");
    } catch (err) {
      fail(err);
    }
  }

  const ready = health?.apify && health?.llm;
  const featuredTable = tables.find((t) => t.status === "live") || tables.filter((t) => t.status === "done").slice(-1)[0];
  const featuredDate = dates.find((d) => d.status === "live") || dates.filter((d) => d.status === "done").slice(-1)[0];

  return (
    <div className="pt-10">
      {stage === "form" ? (
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose">Add someone</div>
            <h1 className="font-display text-5xl leading-tight sm:text-6xl">Two links in. An agent out.</h1>
            <p className="mt-4 max-w-lg text-muted">
              Paste the person&apos;s official LinkedIn and their public Instagram. Their agent reads both, writes a profile, then dates every agent in the season and
              comes back with a ranking. Takes about 3–6 minutes on free-tier APIs; you can watch every step.
            </p>
            <form onSubmit={start} className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <SourceBadge source="linkedin" /> LinkedIn profile
                </span>
                <input required value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://www.linkedin.com/in/username" className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-li" />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <SourceBadge source="instagram" /> Instagram profile (public)
                </span>
                <input required value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://www.instagram.com/username" className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-rose" />
              </label>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  Interested in
                  <select value={interestedIn} onChange={(e) => setInterestedIn(e.target.value as InterestedIn)} className="rounded-lg border border-line bg-white px-2 py-1.5">
                    <option value="anyone">anyone</option>
                    <option value="women">women</option>
                    <option value="men">men</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={withSeason} onChange={(e) => setWithSeason(e.target.checked)} className="accent-rose" />
                  Date the {store.season?.people.length || 25} season agents too
                </label>
                <label className="flex items-center gap-2">
                  Speed dates
                  <select value={tableCount} onChange={(e) => setTableCount(Number(e.target.value))} className="rounded-lg border border-line bg-white px-2 py-1.5">
                    <option value={6}>top 6 (fastest)</option>
                    <option value={10}>top 10</option>
                    <option value={999}>everyone</option>
                  </select>
                </label>
              </div>
              <button disabled={!ready} className="rounded-full bg-rose px-6 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40">
                Create their agent →
              </button>
              {health && !ready && (
                <p className="text-sm text-rose">
                  This server is missing {[!health.apify && "APIFY_TOKEN", !health.llm && "an LLM key (e.g. NVIDIA_API_KEY)"].filter(Boolean).join(" and ")}, so live runs are off. The pre-run
                  season still works.
                </p>
              )}
            </form>
          </div>
          <Card className="self-start">
            <div className="font-semibold">What happens next</div>
            <ol className="mt-3 space-y-3 text-sm text-muted">
              <li>
                <b className="text-ink">1. Scrape.</b> Three Apify actors run in parallel: LinkedIn profile, LinkedIn posts, Instagram profile + latest posts. Only public
                data, no logins.
              </li>
              <li>
                <b className="text-ink">2. Read.</b> The agent reads every item (and looks at the photos), writing cited notes, then a dossier: needs, hobbies, interests,
                values, personality.
              </li>
              <li>
                <b className="text-ink">3. Speed-date.</b> The matchmaker seats it with the most promising agents (or everyone) for four-minute speed dates.
              </li>
              <li>
                <b className="text-ink">4. Ask out.</b> It asks its top 3 on real dates; agents that loved meeting it can ask too. Anyone can say no.
              </li>
              <li>
                <b className="text-ink">5. Date & rank.</b> Real dates in four scenes, private debriefs, and a ranking of who fits best.
              </li>
            </ol>
            <p className="mt-4 text-xs text-muted">Everything you add is saved only in this browser.</p>
          </Card>
        </div>
      ) : (
        <div>
          <Stepper stage={stage} />
          {error && (
            <Card className="mb-6 border-rose/40 bg-rose-soft">
              <div className="font-semibold text-rose">Something went wrong</div>
              <p className="mt-1 text-sm">{error}</p>
              <button onClick={() => (setStage("form"), setError(null), setNotes([]), setTables([]), setInvites([]), setDates([]), setRaw(null), setPerson(null))} className="mt-3 rounded-full bg-ink px-4 py-2 text-sm text-white">
                Start over
              </button>
            </Card>
          )}

          {stage === "scraping" && (
            <Card>
              <div className="flex items-center gap-3">
                <Typing />
                <div className="font-semibold">Scraping public profiles with Apify… {elapsed}s</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["linkedinProfile", "LinkedIn profile", "harvestapi/linkedin-profile-scraper"],
                    ["linkedinPosts", "LinkedIn posts", "harvestapi/linkedin-profile-posts"],
                    ["instagram", "Instagram profile + posts", "apify/instagram-profile-scraper"],
                  ] as const
                ).map(([k, label, actor]) => (
                  <div key={k} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <SourceBadge source={k === "instagram" ? "instagram" : "linkedin"} /> {label}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-muted">{actor}</div>
                    <div className="mt-2 text-sm">
                      {STATUS_ICON[runStatus?.[k] || "READY"]} {runStatus?.[k] || "starting"}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {person && (
            <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar person={person} size={72} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">Agent created</div>
                <div className="font-display text-3xl leading-tight">{person.name}</div>
                <div className="italic text-muted">“{person.analysis.oneLiner}”</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {person.analysis.needs.slice(0, 3).map((n) => (
                    <Tag key={n.label} tone="rose">
                      needs: {n.label}
                    </Tag>
                  ))}
                  {person.analysis.hobbies.slice(0, 3).map((n) => (
                    <Tag key={n.label} tone="violet">
                      {n.label}
                    </Tag>
                  ))}
                </div>
              </div>
              <Link href={`/people/${person.id}`} target="_blank" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                Open full profile ↗
              </Link>
            </Card>
          )}

          {stage === "reading" && raw && (
            <div className="mb-6">
              <div className="mb-3 flex items-center gap-3">
                <h2 className="font-display text-3xl">The agent is reading {raw.linkedin.name}</h2>
                <span className="text-sm text-muted">
                  {raw.linkedin.experience.length} roles · {raw.linkedin.posts.length} LinkedIn posts · {raw.instagram.posts.length} Instagram posts ·{" "}
                  {fmt(raw.instagram.followers)} followers
                </span>
              </div>
              <ReadingView raw={raw} notes={notes} live={stage === "reading"} status={readStatus} />
            </div>
          )}

          {tables.length > 0 && (stage === "speed" || stage === "invites") && person && (
            <div className="mb-6">
              <h2 className="mb-3 font-display text-3xl">
                Speed-dating night · {tables.filter((t) => t.status === "done").length}/{tables.length} tables done
              </h2>
              <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                <div className="grid grid-cols-2 gap-2 self-start sm:grid-cols-3">
                  {tables.map((t) => {
                    const r = t.sd?.ratings[person.id];
                    const r2 = t.sd?.ratings[t.other.id];
                    return (
                      <div key={t.other.id} className={cx("flex items-center gap-2 rounded-xl border bg-card px-2.5 py-2 text-xs", t.status === "live" ? "border-violet" : "border-line", t.status === "waiting" && "opacity-50")}>
                        <Avatar person={t.other} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{t.other.firstName}</div>
                          <div className="text-muted">
                            {t.status === "live" ? <Typing /> : t.status === "done" ? `${r?.score}/10 · ${r2?.score}/10` : t.status === "error" ? "missed" : "waiting"}
                          </div>
                        </div>
                        {r?.wantsDate && r2?.wantsDate && <span>✨</span>}
                      </div>
                    );
                  })}
                </div>
                {featuredTable && <ChatView a={person} b={featuredTable.other} lines={featuredTable.lines} live={featuredTable.status === "live"} compact />}
              </div>
            </div>
          )}

          {invites.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 font-display text-3xl">💌 Invitations</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {invites.map((inv) => {
                  const f = store.person(inv.from);
                  const t = store.person(inv.to);
                  if (!f || !t) return null;
                  return (
                    <Card key={inv.id} className="p-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Avatar person={f} size={28} /> <b>{f.firstName}&apos;s agent</b> <span className="text-muted">asked</span> <Avatar person={t} size={28} /> <b>{t.firstName}</b>
                        <span className="ml-auto">
                          <Tag tone={inv.accepted ? "mint" : "rose"}>{inv.accepted ? "accepted" : "declined"}</Tag>
                        </span>
                      </div>
                      <p className="mt-2 text-sm">“{inv.message}”</p>
                      <p className="mt-1 text-sm text-muted">↳ “{inv.reply}”</p>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {dates.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 font-display text-3xl">On a date right now</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                {dates.map((d) => (
                  <span key={d.inv.id} className={cx("inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm", d.status === "live" ? "border-rose" : "border-line")}>
                    <Avatar person={d.a} size={22} />
                    <Avatar person={d.b} size={22} />
                    {d.title || `${d.a.firstName} & ${d.b.firstName}`}
                    <span className="text-xs text-muted">{d.status === "live" ? d.note && !d.lines.length ? d.note : "live" : d.status === "done" ? (d.date?.mutual ? "💞 mutual" : "done") : d.status}</span>
                    {d.date && (
                      <Link href={`/dates/${d.date.id}`} className="text-xs text-rose underline">
                        open
                      </Link>
                    )}
                  </span>
                ))}
              </div>
              {featuredDate && <ChatView a={featuredDate.a} b={featuredDate.b} lines={featuredDate.lines} scenes={featuredDate.date?.scenes} live={featuredDate.status === "live"} compact />}
            </div>
          )}

          {stage === "done" && person && (
            <div>
              <h2 className="mb-1 font-display text-4xl">Who fits {person.firstName} best</h2>
              <p className="mb-4 text-sm text-muted">Done in {elapsed}s. Everything is saved in this browser — the profile, the dates and the rankings now include {person.firstName}.</p>
              <RankingList personId={person.id} limit={10} />
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/people/${person.id}`} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                  Full profile
                </Link>
                <Link href={`/rankings?p=${person.id}`} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold">
                  Rankings page
                </Link>
                <button onClick={() => window.location.reload()} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold">
                  Add another person
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
