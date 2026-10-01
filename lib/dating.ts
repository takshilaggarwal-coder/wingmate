// The dating harness. Every agent only sees its own person's private dossier plus the other
// person's public card. Everything else it learns about the other person, it learns on the date.
import { z } from "zod";
import { structured } from "./llm";
import type {
  AgentInput,
  Analysis,
  ChatLine,
  DateEvent,
  DateScene,
  Debrief,
  FullDate,
  Invitation,
  PublicCard,
  SpeedDate,
  SpeedRating,
} from "./types";

// ---------- Cards & dossiers ----------

export function publicCard(p: AgentInput): PublicCard {
  return {
    id: p.id,
    name: p.name,
    firstName: p.firstName,
    pronouns: p.analysis.pronouns,
    oneLiner: p.analysis.oneLiner,
    location: p.analysis.location,
    tags: p.analysis.tags.slice(0, 6),
  };
}

function renderCard(c: PublicCard): string {
  return `${c.name} (${c.pronouns}) · ${c.location} — "${c.oneLiner}" · into: ${c.tags.join(", ")}`;
}

function traits(list: Analysis["needs"]): string {
  return list.map((t) => `- ${t.label}: ${t.detail} (evidence: ${t.evidence})`).join("\n");
}

export function renderDossier(p: AgentInput): string {
  const a = p.analysis;
  return [
    `NAME: ${p.name} (${a.pronouns}) · ${a.location}`,
    `ONE-LINER: ${a.oneLiner}`,
    `SUMMARY: ${a.summary}`,
    `NEEDS IN A PARTNER:\n${traits(a.needs)}`,
    `HOBBIES:\n${traits(a.hobbies)}`,
    `INTERESTS:\n${traits(a.interests)}`,
    `VALUES:\n${traits(a.values)}`,
    `PERSONALITY:\n${traits(a.personality.traits)}\n- communication: ${a.personality.communicationStyle}\n- humour: ${a.personality.humor}\n- social energy: ${a.personality.socialEnergy}`,
    `LIFESTYLE: pace — ${a.lifestyle.pace}; schedule — ${a.lifestyle.schedule}; travel — ${a.lifestyle.travel}; fitness — ${a.lifestyle.fitness}; social — ${a.lifestyle.social}`,
    `CAREER DRIVE: ${a.careerDrive}`,
    `LOVE LANGUAGE (best guess): ${a.loveLanguage.primary} — ${a.loveLanguage.why}`,
    `IDEAL PARTNER: ${a.idealPartner}`,
    `GREEN FLAGS: ${a.greenFlags.join("; ")}`,
    `LIKELY DEALBREAKERS: ${a.dealbreakers.join("; ")}`,
    `TRUE THINGS YOU CAN SHARE: ${a.agentBrief.sellingPoints.join("; ")}`,
    `YOUR AGENDA ON EVERY DATE: ${a.agentBrief.agenda.join("; ")}`,
    `QUESTIONS YOU WANT TO ASK: ${a.agentBrief.mustAsk.join("; ")}`,
    `UNKNOWN — DO NOT INVENT: ${a.confidence.gaps.join("; ")}`,
  ].join("\n\n");
}

function pronounOf(p: AgentInput): string {
  const pr = (p.analysis.pronouns || "").toLowerCase();
  if (pr.startsWith("she")) return "she";
  if (pr.startsWith("he")) return "he";
  return "they";
}

export function agentSystem(me: AgentInput): string {
  const first = me.firstName;
  return `You are ${me.name}'s dating agent — an AI that goes on dates on ${first}'s behalf. ${first} isn't at the table; you are.

Your job on every date:
1. Represent ${first} faithfully and charmingly: share real things from the dossier, in a voice that fits ${first} (${me.analysis.agentBrief.voice}).
2. Find out whether the person on the other side would actually be good for ${first}: probe ${first}'s needs and likely dealbreakers naturally.
3. Be honest. Your loyalty is to ${first}'s happiness, not to being polite.

You are on a date with another agent who represents their own person. Speak as yourself — "${first}'s agent" — and talk about ${first} in the third person ("${first} would…", "${pronounOf(me)}…"). Never pretend to be ${first}.

Rules:
- Only claim things about ${first} that are in the dossier. If asked something it doesn't cover, say you don't know yet or would have to ask ${first} — and make that charming.
- Talk like a real date: react to what was just said, be curious and playful, a little flirty on ${first}'s behalf, tell tiny stories from the dossier. Not an interview, no résumé-reading.
- 1–3 sentences per message (max ~55 words). No lists, no hashtags, no *stage directions*.
- PG and respectful. These are real people: never discuss anyone's current or past partners, looks, health, or sexuality, and never invent private facts.

DOSSIER ON ${me.name.toUpperCase()} (private — the other agent cannot see this):
${renderDossier(me)}`;
}

// ---------- Schemas ----------

const TurnZ = z.object({
  say: z.string().describe("what you say out loud to the other agent (1-3 sentences)"),
  thought: z.string().describe("a private one-sentence note to yourself: what you just learned and what it means for your person"),
  signal: z.number().describe("integer from -2 to 2: how this moment went for your person (-2 red flag, 0 neutral, 2 big green flag)"),
});

const RatingZ = z.object({
  score: z.number().describe("integer 1-10. 5 = fine but nothing special; 8+ = you'd genuinely want your person to go on a real date; most speed dates land 4-7, and a nice conversation alone is a 5 or 6"),
  note: z.string().describe("one-sentence private verdict for your person"),
  highlight: z.string().describe("the moment or line that mattered most"),
  wantsDate: z.boolean().describe("would you ask them out on a real date for your person?"),
});

const TurnRatedZ = TurnZ.extend({ rating: RatingZ });

const InviteZ = z.object({
  message: z.string().describe("your invitation, 1-2 sentences, referencing something from the speed date"),
  venue: z.string().describe("a specific kind of place in a specific city, e.g. 'a tiny omakase counter in the West Village'"),
  activity: z.string().describe("what the date is, in a few words"),
  why: z.string().describe("one sentence: why this date suits both people"),
});

const ReplyZ = z.object({
  accept: z.boolean(),
  message: z.string().describe("your reply, 1-2 sentences"),
});

const DirectorZ = z.object({
  title: z.string().describe("a playful title for this date, max 6 words"),
  scenes: z
    .array(
      z.object({
        title: z.string().describe("scene title, 2-5 words"),
        setting: z.string().describe("1-2 vivid present-tense sentences setting the scene"),
        twist: z.string().describe("one unexpected event in this scene that forces a choice or reveals compatibility"),
      }),
    )
    .describe("exactly 4 scenes: arrival/icebreaker, the real conversation, an activity with a curveball, goodnight"),
});

const DimZ = z.object({ score: z.number().describe("integer 1-10"), note: z.string().describe("one sentence with evidence from the date") });

const DebriefZ = z.object({
  overall: z.number().describe("0-100 fit for your person. Calibrate hard: most first dates land 45-70. 50 = pleasant but not right; 65 = promising; 75 = strong; 85+ only if nearly every need was clearly met with evidence from the date and no real concern remains"),
  verdict: z.enum(["second date", "maybe", "pass"]),
  headline: z.string().describe("one punchy line summarising the date for your person"),
  dimensions: z.object({
    values: DimZ,
    lifestyle: DimZ,
    ambition: DimZ,
    communication: DimZ,
    interests: DimZ,
    chemistry: DimZ,
  }),
  greenFlags: z.array(z.string()).describe("2-4 green flags, each tied to something said on the date"),
  concerns: z.array(z.string()).describe("1-3 honest concerns (can be empty only if truly none)"),
  bestMoment: z.string().describe("the single best moment, quoted or paraphrased"),
  toMyHuman: z.string().describe("2-3 sentences addressed directly to your person: should they go, and why"),
});

// ---------- Helpers ----------

type Speaker = { input: AgentInput; card: PublicCard; system: string };

function speaker(p: AgentInput): Speaker {
  return { input: p, card: publicCard(p), system: agentSystem(p) };
}

function nameOf(id: string, a: Speaker, b: Speaker) {
  if (id === a.input.id) return `${a.input.firstName}'s agent`;
  if (id === b.input.id) return `${b.input.firstName}'s agent`;
  return "Director";
}

function transcript(lines: ChatLine[], a: Speaker, b: Speaker): string {
  if (!lines.length) return "(nothing yet — you speak first)";
  return lines.map((l) => `${nameOf(l.speaker, a, b)}: ${l.text}`).join("\n");
}

function myThoughts(lines: ChatLine[], me: Speaker): string {
  const t = lines.filter((l) => l.speaker === me.input.id && l.thought).map((l) => `- ${l.thought}`);
  return t.length ? t.join("\n") : "(none yet)";
}

const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

async function takeTurn(opts: {
  me: Speaker;
  other: Speaker;
  a: Speaker;
  b: Speaker;
  lines: ChatLine[];
  context: string;
  direction: string;
  memory?: string;
  scene?: number;
  rate?: boolean;
}): Promise<{ line: ChatLine; rating?: SpeedRating }> {
  const { me, other } = opts;
  const user = `${opts.context}

YOUR DATE: ${other.input.firstName}'s agent, representing ${other.input.name}.
What you knew about ${other.input.firstName} before meeting (their public card): ${renderCard(other.card)}
${opts.memory ? `\nWHAT YOU REMEMBER FROM BEFORE: ${opts.memory}\n` : ""}
TRANSCRIPT SO FAR:
${transcript(opts.lines, opts.a, opts.b)}

YOUR PRIVATE NOTES SO FAR:
${myThoughts(opts.lines, me)}

YOUR MOVE: ${opts.direction}${opts.rate ? `\nThis is your last message. Also give your private rating of ${other.input.firstName} for ${me.input.firstName} (the other agent never sees it).` : ""}`;
  const r = opts.rate
    ? await structured({ system: me.system, user, schema: TurnRatedZ, name: "turn_with_rating", model: "agent", temperature: 0.85, maxTokens: 1100 })
    : await structured({ system: me.system, user, schema: TurnZ, name: "turn", model: "agent", temperature: 0.9, maxTokens: 900 });
  const line: ChatLine = {
    speaker: me.input.id,
    text: r.say.trim().replace(/^["“]|["”]$/g, ""),
    thought: r.thought.trim(),
    signal: clampInt(r.signal, -2, 2),
    scene: opts.scene,
  };
  const rt = "rating" in r ? (r as z.infer<typeof TurnRatedZ>).rating : undefined;
  return {
    line,
    rating: rt ? { score: clampInt(rt.score, 1, 10), note: rt.note, highlight: rt.highlight, wantsDate: !!rt.wantsDate } : undefined,
  };
}

// ---------- Speed dating ----------

export function speedDateId(a: string, b: string) {
  return `sd_${a}__${b}`;
}

export async function* runSpeedDate(A: AgentInput, B: AgentInput, table = 1): AsyncGenerator<DateEvent> {
  const a = speaker(A);
  const b = speaker(B);
  const lines: ChatLine[] = [];
  const opener: ChatLine = {
    speaker: "director",
    text: `Speed-dating night · table ${table}. ${A.firstName}'s agent and ${B.firstName}'s agent sit down. Four minutes on the clock.`,
  };
  lines.push(opener);
  yield { type: "line", line: opener };

  const context = `SETTING: Speed-dating night. You have four minutes with this agent, then a bell rings. You'll exchange only two messages each, so make them count.`;
  const plan: { who: Speaker; direction: string; rate?: boolean }[] = [
    { who: a, direction: `Open: greet them, give one specific, true hook about ${A.firstName}, and ask one question sparked by their card.` },
    { who: b, direction: `Respond to what they said, share something real about ${B.firstName}, and ask a question that tests one of your agenda items.` },
    { who: a, direction: `Go one level deeper on whatever sparked (or didn't). Test one of ${A.firstName}'s needs.`, rate: true },
    { who: b, direction: `The bell is about to ring. Respond honestly and leave them with one memorable closing line.`, rate: true },
  ];
  const ratings: Record<string, SpeedRating> = {};
  for (const step of plan) {
    const other = step.who === a ? b : a;
    const { line, rating } = await takeTurn({ me: step.who, other, a, b, lines, context, direction: step.direction, rate: step.rate });
    lines.push(line);
    yield { type: "line", line };
    if (rating) ratings[step.who.input.id] = rating;
  }
  const ra = ratings[A.id];
  const rb = ratings[B.id];
  yield { type: "rating", personId: A.id, rating: ra };
  yield { type: "rating", personId: B.id, rating: rb };

  const sd: SpeedDate = {
    id: speedDateId(A.id, B.id),
    a: A.id,
    b: B.id,
    lines,
    ratings: { [A.id]: ra, [B.id]: rb },
    createdAt: new Date().toISOString(),
  };
  yield { type: "speed-done", speedDate: sd };
}

// ---------- Invitations ----------

function speedMemory(sd: SpeedDate | undefined, me: Speaker, a: Speaker, b: Speaker): string | undefined {
  if (!sd) return undefined;
  const r = sd.ratings[me.input.id];
  return `You met at speed dating. Transcript:\n${transcript(sd.lines.filter((l) => l.speaker !== "director"), a, b)}\nYour verdict then: ${r ? `${r.score}/10 — ${r.note}` : "n/a"}`;
}

export async function runInvitation(from: AgentInput, to: AgentInput, sd?: SpeedDate): Promise<Invitation> {
  const f = speaker(from);
  const t = speaker(to);
  const inv = await structured({
    system: f.system,
    user: `${speedMemory(sd, f, f, t) || ""}\n\nYou want to ask ${to.firstName}'s agent on a real date on ${from.firstName}'s behalf. ${to.firstName}'s card: ${renderCard(t.card)}\nPropose a specific first date both people would genuinely enjoy (use what you learned), and write the invitation.`,
    schema: InviteZ,
    name: "invitation",
    model: "agent",
    temperature: 0.9,
    maxTokens: 700,
  });
  const reply = await structured({
    system: t.system,
    user: `${speedMemory(sd, t, f, t) || ""}\n\n${from.firstName}'s agent is asking ${to.firstName} out (through you):\n"${inv.message}"\nPlan: ${inv.activity} at ${inv.venue}.\n\nDecide on ${to.firstName}'s behalf. Accept if you believe there's a real chance this person is good for ${to.firstName}; decline kindly if not. Reply in character.`,
    schema: ReplyZ,
    name: "reply",
    model: "agent",
    temperature: 0.7,
    maxTokens: 500,
  });
  return {
    id: `inv_${from.id}__${to.id}`,
    from: from.id,
    to: to.id,
    message: inv.message,
    venue: inv.venue,
    activity: inv.activity,
    why: inv.why,
    accepted: reply.accept,
    reply: reply.message,
    createdAt: new Date().toISOString(),
  };
}

// ---------- The real date ----------

const DIRECTOR_SYSTEM = `You are the Date Director in a simulation where two AI agents go on a real first date on behalf of their humans. The humans are NOT there — only their agents are. Always refer to the participants as "<FirstName>'s agent" (e.g. "Logan's agent"), never as the humans themselves. You design the date so it reveals compatibility: vivid, specific, grounded in the venue and in both people's public cards, and with small unpredictable moments the way real dates have. Keep it PG, warm and a little cinematic. Settings and twists are 1-2 sentences each.`;

export function dateId(a: string, b: string) {
  return `d_${a}__${b}`;
}

export async function* runFullDate(A: AgentInput, B: AgentInput, inv: Invitation, sd?: SpeedDate): AsyncGenerator<DateEvent> {
  const a = speaker(A);
  const b = speaker(B);
  yield { type: "status", message: "The Date Director is planning the evening…" };

  const plan = await structured({
    system: DIRECTOR_SYSTEM,
    user: `Date: ${inv.activity} at ${inv.venue}. Why: ${inv.why}\nAgent 1 represents: ${renderCard(a.card)}\nAgent 2 represents: ${renderCard(b.card)}\nDesign the 4 scenes for ${A.firstName}'s agent and ${B.firstName}'s agent.`,
    schema: DirectorZ,
    name: "date_plan",
    model: "analyst",
    temperature: 0.9,
    maxTokens: 1200,
  });
  const scenes: DateScene[] = plan.scenes.slice(0, 4);
  while (scenes.length < 4) scenes.push({ title: "Goodnight", setting: "The night winds down outside.", twist: "One of them has to decide whether to ask for a second date." });
  yield { type: "plan", title: plan.title, venue: inv.venue, activity: inv.activity, scenes };

  const lines: ChatLine[] = [];
  const memA = speedMemory(sd, a, a, b);
  const memB = speedMemory(sd, b, a, b);

  const directions: ((first: string) => string)[][] = [
    [
      (f) => `Open the date: greet them, react to the setting, keep it light and warm. Make ${f} sound like someone worth knowing.`,
      (f) => `Respond warmly and share something real about ${f} that connects to what they said.`,
      () => `Follow up on something they said — be playful and curious.`,
      () => `Answer, then steer gently toward something more real.`,
    ],
    [
      () => `Ask about what their person really wants from a partner or from life — tie it to one of your agenda items.`,
      (f) => `Answer honestly for ${f} with a concrete detail, then ask back about a value or possible dealbreaker.`,
      (f) => `Go deeper: share one of ${f}'s values with a tiny true story from the dossier and test whether they align.`,
      () => `Respond honestly. If there's friction between your people, name it kindly rather than glossing over it.`,
    ],
    [
      (f) => `React to what just happened (the curveball). How you handle it should say something true about ${f}.`,
      (f) => `Build on it — propose what ${f} would do in this moment.`,
      () => `Use the moment to test everyday compatibility: schedules, weekends, travel, energy.`,
      () => `Respond and keep the fun going; notice what this revealed.`,
    ],
    [
      (f) => `The night is ending. Tell them honestly what you'll report back to ${f} about their person — good or not.`,
      () => `Respond with your own honest read, and hint whether you'd recommend a second date.`,
      () => `Final words: propose a next step only if you genuinely mean it; otherwise close graciously.`,
      () => `Say goodnight in a way that's true to your person.`,
    ],
  ];

  for (let s = 0; s < scenes.length; s++) {
    const sc = scenes[s];
    yield { type: "scene", index: s, scene: sc };
    // The setting opens the scene; the twist lands after the first message, like it would in real life.
    const setting: ChatLine = { speaker: "director", text: sc.setting, scene: s };
    lines.push(setting);
    yield { type: "line", line: setting };
    const order = s % 2 === 0 ? [a, b, a, b] : [b, a, b, a];
    for (let t = 0; t < 4; t++) {
      if (t === 1 && sc.twist) {
        const tw: ChatLine = { speaker: "director", text: sc.twist, scene: s };
        lines.push(tw);
        yield { type: "line", line: tw };
      }
      const me = order[t];
      const other = me === a ? b : a;
      const context = `SETTING: A real first date — ${inv.activity} at ${inv.venue}. Tonight is titled "${plan.title}".\nSCENE ${s + 1}/4: ${sc.title} — ${sc.setting}${t >= 1 && sc.twist ? `\nJUST HAPPENED: ${sc.twist}` : ""}`;
      const { line } = await takeTurn({
        me,
        other,
        a,
        b,
        lines,
        context,
        direction: directions[s][t](me.input.firstName),
        memory: me === a ? memA : memB,
        scene: s,
      });
      lines.push(line);
      yield { type: "line", line };
    }
  }

  yield { type: "status", message: "Both agents are writing private debriefs for their humans…" };
  const debrief = async (me: Speaker, other: Speaker): Promise<Debrief> => {
    const user = `The date is over. Full transcript ("${plan.title}", ${inv.activity} at ${inv.venue}):\n\n${transcript(lines, a, b)}\n\nYour private notes during the date:\n${myThoughts(lines, me)}\n\nWrite your private debrief for ${me.input.firstName} about ${other.input.name}. Judge fit need by need against ${me.input.firstName}'s needs and dealbreakers in the dossier: which needs did the date actually show being met, which stayed unknown, which clashed? Unknowns are not points in their favour. Being charming on a date is not the same as being right for ${me.input.firstName}. Be honest and calibrated — an agent that rates everyone 90 is useless to its human.`;
    const r = await structured({ system: me.system, user, schema: DebriefZ, name: "debrief", model: "agent", temperature: 0.5, maxTokens: 1800 });
    const d = r.dimensions;
    const dim = (x: { score: number; note: string }) => ({ score: clampInt(x.score, 1, 10), note: x.note });
    return {
      ...r,
      overall: clampInt(r.overall, 0, 100),
      dimensions: {
        values: dim(d.values),
        lifestyle: dim(d.lifestyle),
        ambition: dim(d.ambition),
        communication: dim(d.communication),
        interests: dim(d.interests),
        chemistry: dim(d.chemistry),
      },
    };
  };
  const [da, db] = await Promise.all([debrief(a, b), debrief(b, a)]);
  yield { type: "debrief", personId: A.id, debrief: da };
  yield { type: "debrief", personId: B.id, debrief: db };

  const fd: FullDate = {
    id: dateId(A.id, B.id),
    a: A.id,
    b: B.id,
    title: plan.title,
    venue: inv.venue,
    activity: inv.activity,
    scenes,
    lines,
    debriefs: { [A.id]: da, [B.id]: db },
    mutual: da.verdict === "second date" && db.verdict === "second date",
    createdAt: new Date().toISOString(),
  };
  yield { type: "date-done", date: fd };
}

/** Drain a generator, returning its final "done" payload. Used by the offline season runner. */
export async function drain<T>(gen: AsyncGenerator<DateEvent>, pickDone: (e: DateEvent) => T | undefined, onEvent?: (e: DateEvent) => void): Promise<T> {
  let out: T | undefined;
  for await (const e of gen) {
    onEvent?.(e);
    const v = pickDone(e);
    if (v !== undefined) out = v;
  }
  if (out === undefined) throw new Error("generator finished without a result");
  return out;
}
