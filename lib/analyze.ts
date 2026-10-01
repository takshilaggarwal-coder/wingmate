// How an agent reads its person: (1) field notes while reading both sources (streamed),
// (2) a structured profile synthesized from the sources + notes.
import { z } from "zod";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { MODEL, streamText, structured } from "./llm";
import { TAGS } from "./tags";
import type { Analysis, RawSources, ReadingNote } from "./types";

// ---------- Source rendering ----------

export function renderSources(raw: RawSources): string {
  const li = raw.linkedin;
  const ig = raw.instagram;
  const out: string[] = [];
  out.push("=== SOURCE 1: LINKEDIN (public profile) ===");
  out.push(`[li-headline] ${li.name} — ${li.headline || "(no headline)"}${li.location ? ` · ${li.location}` : ""}`);
  if (li.followers) out.push(`(followers: ${li.followers.toLocaleString("en-US")})`);
  if (li.about) out.push(`[li-about] ${li.about}`);
  li.experience.forEach((e, i) =>
    out.push(`[li-exp-${i + 1}] ${e.title || "?"} @ ${e.company || "?"}${e.duration ? ` (${e.duration})` : ""}${e.location ? ` · ${e.location}` : ""}${e.description ? ` — ${e.description}` : ""}`),
  );
  li.education.forEach((e, i) => out.push(`[li-edu-${i + 1}] ${[e.school, e.degree, e.field, e.years].filter(Boolean).join(" · ")}`));
  if (li.skills.length) out.push(`[li-skills] ${li.skills.join(", ")}`);
  if (li.languages.length) out.push(`[li-languages] ${li.languages.join(", ")}`);
  if (li.volunteering.length) out.push(`[li-volunteering] ${li.volunteering.join(", ")}`);
  if (li.certifications.length) out.push(`[li-certs] ${li.certifications.join(", ")}`);
  li.posts.forEach((p) => out.push(`[${p.ref}]${p.date ? ` (${p.date})` : ""} ${p.text.replace(/\s+/g, " ")}`));

  out.push("");
  out.push("=== SOURCE 2: INSTAGRAM (public profile) ===");
  out.push(`[ig-bio] @${ig.username}${ig.fullName ? ` (${ig.fullName})` : ""}${ig.category ? ` · ${ig.category}` : ""}: ${ig.bio || "(empty bio)"}${ig.externalUrl ? ` · link: ${ig.externalUrl}` : ""}`);
  if (ig.followers) out.push(`(followers: ${ig.followers.toLocaleString("en-US")}, posts: ${ig.postsCount ?? "?"})`);
  ig.posts.forEach((p) => {
    const bits = [
      p.type ? `${p.type}` : "",
      p.timestamp ? p.timestamp.slice(0, 10) : "",
      p.location ? `at ${p.location}` : "",
    ].filter(Boolean);
    out.push(
      `[${p.ref}] (${bits.join(", ")}) ${p.caption ? p.caption.replace(/\s+/g, " ") : "(no caption)"}${p.alt ? ` [image description: ${p.alt}]` : ""}`,
    );
  });
  return out.join("\n");
}

export interface PostImage {
  ref: string;
  dataUrl: string;
}

function contentWithImages(text: string, images: PostImage[]): string | ChatCompletionContentPart[] {
  if (!images.length) return text;
  const parts: ChatCompletionContentPart[] = [];
  for (const img of images) {
    parts.push({ type: "text", text: `Photo from ${img.ref}:` });
    parts.push({ type: "image_url", image_url: { url: img.dataUrl, detail: "low" } });
  }
  parts.push({ type: "text", text });
  return parts;
}

// ---------- Step 1: reading notes (streamed) ----------

const READER_SYSTEM = `You are a dating agent. You are about to represent one real person on dates, and right now you are reading everything you are allowed to know about them: their public LinkedIn and their public Instagram. Nothing else exists for you — if you happen to recognise the person, ignore anything you know from outside these two sources.

Write your field notes while you read, one observation per line, in this exact format:
[ref] observation

- ref is the bracketed id of the item you are reading (e.g. li-about, li-exp-2, li-post-3, ig-bio, ig-post-5). For a photo, use the post's ref.
- Each observation is one sharp sentence (max ~30 words) that says what you noticed AND what it suggests about them as a partner (e.g. "→ needs a partner who respects 5am routines").
- Read like a detective: notice patterns across posts, tone of voice, what they're proud of, how they spend weekends, who they celebrate, what they joke about, what the photos show (places, activities, style, people, pets, food).
- Cover both sources. Write 16–22 notes. Start with LinkedIn, then Instagram, then end with 2–3 notes tagged [synthesis] that connect the two sources.
- Do not comment on looks/attractiveness, health, sexual orientation, or anyone's current or past romantic partners. Family can be noted only in general terms.
- No preamble, no headings, no blank lines — only note lines.`;

export async function* readPerson(raw: RawSources, images: PostImage[]): AsyncGenerator<ReadingNote> {
  const text = `Here is everything you get to read about ${raw.linkedin.name}.\n\n${renderSources(raw)}\n\nWrite your field notes now.`;
  let buf = "";
  const flush = (line: string): ReadingNote | null => {
    const m = line.trim().match(/^\[([a-z0-9-]+)\]\s*(.+)$/i);
    if (!m) return null;
    const ref = m[1].toLowerCase();
    const source = ref.startsWith("ig") ? "instagram" : ref.startsWith("li") ? "linkedin" : "linkedin";
    return { ref, source: ref === "synthesis" ? "linkedin" : source, text: m[2].trim() };
  };
  let produced = 0;
  async function* attempt(withImages: boolean): AsyncGenerator<ReadingNote> {
    for await (const delta of streamText({ system: READER_SYSTEM, user: withImages ? contentWithImages(text, images) : text, model: MODEL, temperature: 0.4 })) {
      buf += delta;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const note = flush(line);
        if (note) {
          produced++;
          yield note;
        }
      }
    }
    const last = flush(buf);
    buf = "";
    if (last) yield last;
  }
  try {
    yield* attempt(images.length > 0);
  } catch (e) {
    // If the model rejects the photos (format/size), read the text sources alone rather than failing.
    if (!images.length || produced > 0) throw e;
    buf = "";
    yield* attempt(false);
  }
}

// ---------- Step 2: structured profile ----------

const TraitZ = z.object({
  label: z.string().describe("2-5 word label"),
  detail: z.string().describe("one specific sentence about this person, not generic"),
  source: z.enum(["linkedin", "instagram", "both"]),
  evidence: z.string().describe("the concrete signal: a short quote or the item ref, e.g. 'ig-post-4: \"sunrise run before the studio\"'"),
});

export const AnalysisZ = z.object({
  oneLiner: z.string().describe("A witty, warm dating-profile one-liner (max 16 words) that is specific to them"),
  summary: z.string().describe("3-4 sentences: who they are, what drives them, what they'd be like to date"),
  pronouns: z.string().describe("e.g. she/her, he/him, they/them — based on how the sources refer to them; they/them if unclear"),
  location: z.string().describe("city/region from the sources, or 'Unknown'"),
  needs: z.array(TraitZ).describe("5 relationship needs: what this person needs from a partner to thrive"),
  hobbies: z.array(TraitZ).describe("4-6 hobbies/activities they actually do"),
  interests: z.array(TraitZ).describe("4-6 topics they care about / follow / talk about"),
  values: z.array(TraitZ).describe("3-5 core values"),
  personality: z.object({
    traits: z.array(TraitZ).describe("4 personality traits"),
    communicationStyle: z.string(),
    humor: z.string().describe("their sense of humour, from captions/posts"),
    socialEnergy: z.enum(["introvert", "ambivert", "extrovert"]),
    bigFive: z.object({
      openness: z.number().describe("0-100"),
      conscientiousness: z.number().describe("0-100"),
      extraversion: z.number().describe("0-100"),
      agreeableness: z.number().describe("0-100"),
      neuroticism: z.number().describe("0-100"),
    }),
  }),
  lifestyle: z.object({
    pace: z.string().describe("e.g. 'always-on founder pace'"),
    schedule: z.string(),
    travel: z.string(),
    fitness: z.string(),
    social: z.string(),
  }),
  careerDrive: z.string().describe("how central work/ambition is, one sentence"),
  loveLanguage: z.object({
    primary: z.enum(["Words of affirmation", "Quality time", "Acts of service", "Physical touch", "Receiving gifts"]),
    why: z.string().describe("best guess with the evidence that suggests it"),
  }),
  idealPartner: z.string().describe("2-3 sentences describing the partner who would fit them best"),
  greenFlags: z.array(z.string()).describe("4 things in a partner that would make them light up"),
  dealbreakers: z.array(z.string()).describe("3-4 likely points of friction or dealbreakers"),
  dateIdeas: z.array(z.string()).describe("3 specific first-date ideas they'd love"),
  conversationStarters: z.array(z.string()).describe("3 questions that would get them talking"),
  agentBrief: z.object({
    voice: z.string().describe("how their agent should sound on dates to represent them faithfully (tone, energy, humour)"),
    sellingPoints: z.array(z.string()).describe("4 true, evidence-backed things the agent can share about them on a date"),
    agenda: z.array(z.string()).describe("3-4 things the agent must find out about a date to judge fit, tied to the needs"),
    mustAsk: z.array(z.string()).describe("3 natural questions the agent will ask on dates"),
  }),
  tags: z.array(z.enum(TAGS)).describe("8-14 tags from the fixed vocabulary that best describe them"),
  confidence: z.object({
    overall: z.number().describe("0-100: how much signal the two sources gave"),
    gaps: z.array(z.string()).describe("2-3 important things the sources do NOT reveal"),
  }),
});

const ANALYST_SYSTEM = `You are a dating agent finishing your read of the person you will represent. You have their public LinkedIn, their public Instagram, and your own field notes. Those are your only sources — ignore anything you might know about this person from elsewhere.

Build their dating dossier. Rules:
- Be specific to THIS person. Every trait must be grounded in a concrete signal from the sources (quote or ref). Generic statements like "values hard work" without evidence are failures.
- Needs are relationship needs (what a partner must give them), inferred from how they live and what they post.
- Be honest about uncertainty: if the sources don't support something, put it in confidence.gaps rather than inventing it.
- Never mention current or past romantic partners, never speculate about sexual orientation, health, or looks. This is a hypothetical compatibility exercise built from public professional and social presence.
- Write with warmth and wit, like a great matchmaker, but stay truthful.`;

export async function analyzePerson(raw: RawSources, notes: ReadingNote[]): Promise<Analysis> {
  const user = `SOURCES\n${renderSources(raw)}\n\nYOUR FIELD NOTES\n${notes.map((n) => `[${n.ref}] ${n.text}`).join("\n")}\n\nNow write ${raw.linkedin.name}'s dossier.`;
  const a = await structured({ system: ANALYST_SYSTEM, user, schema: AnalysisZ, name: "dossier", model: MODEL, temperature: 0.4, maxTokens: 6000 });
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const b = a.personality.bigFive;
  return {
    ...a,
    personality: {
      ...a.personality,
      bigFive: {
        openness: clamp(b.openness),
        conscientiousness: clamp(b.conscientiousness),
        extraversion: clamp(b.extraversion),
        agreeableness: clamp(b.agreeableness),
        neuroticism: clamp(b.neuroticism),
      },
    },
    tags: Array.from(new Set(a.tags)),
    confidence: { ...a.confidence, overall: clamp(a.confidence.overall) },
  };
}
