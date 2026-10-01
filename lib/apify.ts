// Scraping layer: Apify actors for LinkedIn (profile + posts) and Instagram (profile + latest posts).
// No cookies or logins are used; only public profile data.
import type { InstagramPost, LinkedInPost, RawInstagram, RawLinkedIn } from "./types";

const API = "https://api.apify.com/v2";

export const ACTORS = {
  linkedinProfile: process.env.APIFY_LINKEDIN_PROFILE_ACTOR || "harvestapi~linkedin-profile-scraper",
  linkedinPosts: process.env.APIFY_LINKEDIN_POSTS_ACTOR || "harvestapi~linkedin-profile-posts",
  instagram: process.env.APIFY_INSTAGRAM_ACTOR || "apify~instagram-profile-scraper",
};

export type RunKind = keyof typeof ACTORS;

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("APIFY_TOKEN is not configured on the server.");
  return t;
}

async function apify<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ---------- URL parsing ----------

export function parseLinkedInUrl(input: string): { url: string; slug: string } | null {
  const s = input.trim();
  const m = s.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).replace(/\/$/, "");
  return { url: `https://www.linkedin.com/in/${slug}/`, slug };
}

export function parseInstagramUrl(input: string): { url: string; username: string } | null {
  const s = input.trim();
  let username: string | null = null;
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (m && !["p", "reel", "reels", "stories", "explore", "tv"].includes(m[1].toLowerCase())) username = m[1];
  else if (/^@?[A-Za-z0-9._]{1,30}$/.test(s)) username = s.replace(/^@/, "");
  if (!username) return null;
  return { url: `https://www.instagram.com/${username}/`, username: username.toLowerCase() };
}

// ---------- Runs ----------

export function actorInput(kind: RunKind, target: string): Record<string, unknown> {
  switch (kind) {
    case "linkedinProfile":
      return { profileScraperMode: "Profile details no email ($4 per 1k)", queries: [target] };
    case "linkedinPosts":
      return {
        targetUrls: [target],
        maxPosts: 10,
        includeReposts: false,
        includeQuotePosts: true,
        scrapeReactions: false,
        scrapeComments: false,
      };
    case "instagram":
      return { usernames: [target], includeAboutSection: false };
  }
}

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
  statusMessage?: string;
}

export async function startRun(kind: RunKind, target: string, maxWaitMs = 45_000): Promise<ApifyRun> {
  const started = Date.now();
  for (;;) {
    try {
      const r = await apify<{ data: ApifyRun }>(`/acts/${ACTORS[kind]}/runs`, {
        method: "POST",
        body: JSON.stringify(actorInput(kind, target)),
      });
      return r.data;
    } catch (e) {
      // Free Apify plans allow 5 concurrent runs; wait for a slot instead of failing.
      if (!/concurrent Actor runs/i.test((e as Error).message) || Date.now() - started > maxWaitMs) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export async function getRun(runId: string, waitSecs = 0): Promise<ApifyRun> {
  const r = await apify<{ data: ApifyRun }>(`/actor-runs/${runId}?waitForFinish=${Math.min(60, Math.max(0, waitSecs))}`);
  return r.data;
}

export async function getItems<T = Record<string, unknown>>(datasetId: string): Promise<T[]> {
  return apify<T[]>(`/datasets/${datasetId}/items?clean=true&format=json`);
}

export const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);

/** Run an actor to completion (used by the offline season script). */
export async function runToCompletion(kind: RunKind, target: string): Promise<Record<string, unknown>[]> {
  let run = await startRun(kind, target, 10 * 60_000);
  const started = Date.now();
  while (!TERMINAL.has(run.status)) {
    if (Date.now() - started > 8 * 60_000) throw new Error(`${kind} run timed out`);
    run = await getRun(run.id, 45);
  }
  if (run.status !== "SUCCEEDED") throw new Error(`${kind} run ${run.status}: ${run.statusMessage || ""}`);
  return getItems(run.defaultDatasetId);
}

// ---------- Normalization (tolerant to field-name differences between actor versions) ----------

type Obj = Record<string, unknown>;
const str = (v: unknown): string | undefined => {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
};
const num = (v: unknown): number | undefined => (typeof v === "number" && isFinite(v) ? v : undefined);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Obj[]) : []);
const pick = (o: Obj | undefined, ...keys: string[]): unknown => {
  if (!o) return undefined;
  for (const k of keys) {
    const v = k.split(".").reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Obj)[part] : undefined), o);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};
const clip = (s: string | undefined, n: number) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s);

function dateRange(o: Obj): string | undefined {
  const direct = str(pick(o, "duration", "dateRange", "caption", "timePeriod"));
  if (direct) return direct;
  const start = pick(o, "startDate.text", "startDate.year", "start.year", "starts_at.year");
  const end = pick(o, "endDate.text", "endDate.year", "end.year", "ends_at.year");
  if (start || end) return `${str(start) || "?"} – ${str(end) || "present"}`;
  return undefined;
}

export function normalizeLinkedIn(url: string, profile: Obj | undefined, postItems: Obj[]): RawLinkedIn {
  const p = profile || {};
  const first = str(pick(p, "firstName"));
  const last = str(pick(p, "lastName"));
  const name = str(pick(p, "fullName", "name")) || [first, last].filter(Boolean).join(" ") || "Unknown";

  const experience = arr(pick(p, "experience", "experiences", "positions")).slice(0, 10).map((e) => {
    const desc = pick(e, "description", "summary");
    return {
      title: str(pick(e, "position", "title", "jobTitle")),
      company: str(pick(e, "companyName", "company", "subtitle", "company.name")),
      duration: dateRange(e),
      location: str(pick(e, "location", "locationName")),
      description: clip(Array.isArray(desc) ? desc.map((d) => str(d) || str((d as Obj)?.text)).filter(Boolean).join(" ") : str(desc), 500),
    };
  });

  const education = arr(pick(p, "education", "educations", "schools")).slice(0, 6).map((e) => ({
    school: str(pick(e, "schoolName", "school", "title", "name")),
    degree: str(pick(e, "degree", "degreeName", "subtitle")),
    field: str(pick(e, "fieldOfStudy", "field")),
    years: dateRange(e),
  }));

  const listOfNames = (v: unknown, ...keys: string[]): string[] =>
    (Array.isArray(v) ? v : [])
      .map((x) => (typeof x === "string" ? x : str(pick(x as Obj, ...keys))))
      .filter((x): x is string => !!x);

  const posts: LinkedInPost[] = postItems
    .map((it): LinkedInPost | null => {
      const text = str(pick(it, "content", "text", "commentary", "postText"));
      if (!text) return null;
      return {
        ref: "",
        text: clip(text, 900) || text,
        date: str(pick(it, "postedAt.date", "postedAt", "postedAtISO", "date", "postedDate")),
        likes: num(pick(it, "engagement.likes", "numLikes", "likesCount", "totalReactionCount")),
        comments: num(pick(it, "engagement.comments", "numComments", "commentsCount")),
      };
    })
    .filter((x): x is LinkedInPost => !!x)
    .slice(0, 10)
    .map((x, i) => ({ ...x, ref: `li-post-${i + 1}` }));

  const loc = pick(p, "location.linkedinText", "location.parsed.text", "location.default", "location", "addressWithCountry", "geoLocationName");

  return {
    url,
    publicIdentifier: str(pick(p, "publicIdentifier", "username")),
    name,
    headline: str(pick(p, "headline", "occupation")),
    about: clip(str(pick(p, "about", "summary")), 2600),
    location: typeof loc === "string" ? loc : undefined,
    followers: num(pick(p, "followerCount", "followers", "followersCount")),
    connections: num(pick(p, "connectionsCount", "connections")),
    photoUrl: str(pick(p, "photo", "profilePicture", "profilePic", "pictureUrl", "profilePicHighQuality", "profilePictureUrl")),
    experience,
    education,
    skills: listOfNames(pick(p, "skills"), "name", "title").slice(0, 25),
    languages: listOfNames(pick(p, "languages"), "name", "language", "title").slice(0, 8),
    certifications: listOfNames(pick(p, "certifications", "licenses"), "title", "name").slice(0, 8),
    volunteering: listOfNames(pick(p, "volunteering", "volunteerExperience", "volunteer"), "role", "title", "organization").slice(0, 6),
    posts,
  };
}

export function normalizeInstagram(url: string, item: Obj | undefined): RawInstagram {
  const p = item || {};
  const posts: InstagramPost[] = arr(pick(p, "latestPosts"))
    .slice(0, 12)
    .map((it, i) => ({
      ref: `ig-post-${i + 1}`,
      type: str(pick(it, "type")),
      caption: clip(str(pick(it, "caption")), 900),
      hashtags: (Array.isArray(it.hashtags) ? it.hashtags : []).filter((h): h is string => typeof h === "string").slice(0, 15),
      mentions: (Array.isArray(it.mentions) ? it.mentions : []).filter((h): h is string => typeof h === "string").slice(0, 10),
      likes: num(pick(it, "likesCount")),
      comments: num(pick(it, "commentsCount")),
      timestamp: str(pick(it, "timestamp")),
      imageUrl: str(pick(it, "displayUrl", "images.0")),
      location: str(pick(it, "locationName")),
      alt: clip(str(pick(it, "alt", "accessibilityCaption")), 300),
      url: str(pick(it, "url")),
    }));
  return {
    url,
    username: str(pick(p, "username")) || "",
    fullName: str(pick(p, "fullName")),
    bio: str(pick(p, "biography")),
    followers: num(pick(p, "followersCount")),
    following: num(pick(p, "followsCount")),
    postsCount: num(pick(p, "postsCount")),
    verified: !!pick(p, "verified"),
    isPrivate: !!pick(p, "private"),
    category: str(pick(p, "businessCategoryName")),
    externalUrl: str(pick(p, "externalUrl")),
    profilePicUrl: str(pick(p, "profilePicUrlHD", "profilePicUrl")),
    posts,
  };
}

// ---------- Images ----------

const IMAGE_HOSTS = /(cdninstagram\.com|fbcdn\.net|licdn\.com)$/i;

export function isAllowedImageHost(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return IMAGE_HOSTS.test(h);
  } catch {
    return false;
  }
}

export async function fetchImage(u: string, maxBytes = 4_000_000): Promise<{ bytes: Buffer; type: string } | null> {
  if (!u || !isAllowedImageHost(u)) return null;
  try {
    const res = await fetch(u, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return { bytes: buf, type };
  } catch {
    return null;
  }
}

export async function fetchImageDataUrl(u: string | undefined, maxBytes = 1_500_000): Promise<string | undefined> {
  if (!u) return undefined;
  const img = await fetchImage(u, maxBytes);
  if (!img) return undefined;
  return `data:${img.type};base64,${img.bytes.toString("base64")}`;
}
