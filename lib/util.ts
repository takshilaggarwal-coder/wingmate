import type { AgentInput, Invitation, Person, SpeedDate } from "./types";
import { forecast, pairKey } from "./ranking";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function toAgent(p: Person): AgentInput {
  return { id: p.id, name: p.name, firstName: p.firstName, analysis: p.analysis };
}

/** Run tasks with bounded concurrency. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Who does this agent ask out after speed dating? Its own top picks: highest speed-date score,
 * "would ask out" as a bonus, matchmaker forecast as a tie-breaker.
 */
export function pickInvites(person: Person, people: Person[], speedDates: SpeedDate[], k = 3, exclude = new Set<string>()): string[] {
  const byPair = new Map(speedDates.map((s) => [pairKey(s.a, s.b), s]));
  return people
    .filter((o) => o.id !== person.id && !exclude.has(o.id))
    .map((o) => {
      const sd = byPair.get(pairKey(person.id, o.id));
      const r = sd?.ratings[person.id];
      const f = forecast(person.analysis, o.analysis).score;
      return { id: o.id, s: (r ? r.score * 10 + (r.wantsDate ? 8 : 0) : 0) + f * 0.1, has: !!r };
    })
    .filter((x) => x.has)
    .sort((x, y) => y.s - x.s)
    .slice(0, k)
    .map((x) => x.id);
}

export function hasInvitationBetween(invs: Invitation[], a: string, b: string) {
  return invs.some((i) => (i.from === a && i.to === b) || (i.from === b && i.to === a));
}
