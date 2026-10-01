// Matchmaker forecast (before any date) and final rankings (after the dates).
import type { Analysis, FullDate, InterestedIn, Person, RankingEntry, SpeedDate } from "./types";

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);

export interface Forecast {
  score: number;
  shared: string[];
  notes: string[];
}

/** Pre-date compatibility forecast from the two dossiers (no LLM, fully transparent). */
export function forecast(a: Analysis, b: Analysis): Forecast {
  const ta = new Set(a.tags);
  const tb = new Set(b.tags);
  const shared = [...ta].filter((t) => tb.has(t));
  const tagSim = ta.size && tb.size ? shared.length / Math.sqrt(ta.size * tb.size) : 0;

  const fa = a.personality.bigFive;
  const fb = b.personality.bigFive;
  const sim = (x: number, y: number) => 1 - Math.abs(x - y) / 100;
  const b5 = (sim(fa.openness, fb.openness) + sim(fa.conscientiousness, fb.conscientiousness) + sim(fa.agreeableness, fb.agreeableness)) / 3;
  const calm = 1 - (fa.neuroticism + fb.neuroticism) / 400;

  const ea = a.personality.socialEnergy;
  const eb = b.personality.socialEnergy;
  const energy = ea === eb ? 1 : ea === "ambivert" || eb === "ambivert" ? 0.85 : 0.6;

  const va = new Set(a.values.flatMap((v) => words(v.label)));
  const vb = new Set(b.values.flatMap((v) => words(v.label)));
  const valueOverlap = [...va].filter((w) => vb.has(w)).length;

  const raw = 0.45 * Math.min(1, tagSim * 1.6) + 0.25 * b5 + 0.1 * calm + 0.12 * energy + 0.08 * Math.min(1, valueOverlap / 2);
  const score = Math.round(35 + 60 * raw);

  const notes: string[] = [];
  if (shared.length) notes.push(`shared: ${shared.slice(0, 4).join(", ")}`);
  if (ea === eb) notes.push(`both ${ea}s`);
  if (b5 > 0.8) notes.push("similar temperaments");
  return { score, shared, notes };
}

export function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface Indexes {
  speed: Map<string, SpeedDate>;
  dates: Map<string, FullDate>;
}

export function indexes(speedDates: SpeedDate[], dates: FullDate[]): Indexes {
  const speed = new Map<string, SpeedDate>();
  for (const s of speedDates) speed.set(pairKey(s.a, s.b), s);
  const d = new Map<string, FullDate>();
  for (const x of dates) d.set(pairKey(x.a, x.b), x);
  return { speed, dates: d };
}

export function rankFor(person: Person, people: Person[], idx: Indexes): RankingEntry[] {
  const out: RankingEntry[] = [];
  for (const other of people) {
    if (other.id === person.id) continue;
    const key = pairKey(person.id, other.id);
    const sd = idx.speed.get(key);
    const fd = idx.dates.get(key);
    const prior = forecast(person.analysis, other.analysis).score;
    const mySpeed = sd?.ratings[person.id];
    const theirSpeed = sd?.ratings[other.id];
    const myDebrief = fd?.debriefs[person.id];
    const theirDebrief = fd?.debriefs[other.id];

    if (myDebrief && theirDebrief) {
      const myView = mySpeed ? 0.8 * myDebrief.overall + 0.2 * mySpeed.score * 10 : myDebrief.overall;
      const theirView = theirSpeed ? 0.8 * theirDebrief.overall + 0.2 * theirSpeed.score * 10 : theirDebrief.overall;
      out.push({
        personId: person.id,
        otherId: other.id,
        score: Math.round(0.55 * myView + 0.3 * theirView + 0.15 * prior),
        myView: Math.round(myView),
        theirView: Math.round(theirView),
        prior,
        basis: "date",
        mutual: fd!.mutual,
        reason: myDebrief.headline,
        dateId: fd!.id,
        speedId: sd?.id,
      });
    } else if (mySpeed && theirSpeed) {
      const myView = mySpeed.score * 10;
      const theirView = theirSpeed.score * 10;
      out.push({
        personId: person.id,
        otherId: other.id,
        score: Math.round(0.5 * myView + 0.3 * theirView + 0.2 * prior),
        myView,
        theirView,
        prior,
        basis: "speed",
        mutual: mySpeed.wantsDate && theirSpeed.wantsDate && mySpeed.score >= 8 && theirSpeed.score >= 8,
        reason: mySpeed.note,
        speedId: sd!.id,
      });
    } else {
      const f = forecast(person.analysis, other.analysis);
      out.push({
        personId: person.id,
        otherId: other.id,
        score: Math.round(prior * 0.85),
        myView: null,
        theirView: null,
        prior,
        basis: "forecast",
        mutual: false,
        reason: `Matchmaker forecast only — they haven't met yet${f.notes.length ? ` (${f.notes.join("; ")})` : ""}.`,
      });
    }
  }
  return out.sort((x, y) => y.score - x.score || (y.myView ?? 0) - (x.myView ?? 0));
}

export function genderOf(p: Person): "woman" | "man" | "other" {
  const pr = (p.analysis.pronouns || "").toLowerCase();
  if (pr.startsWith("she")) return "woman";
  if (pr.startsWith("he")) return "man";
  return "other";
}

export function matchesPreference(pref: InterestedIn, other: Person): boolean {
  if (pref === "anyone") return true;
  const g = genderOf(other);
  return pref === "women" ? g === "woman" : g === "man";
}
