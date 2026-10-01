// Keeps people's real romantic relationships out of the agents' dossiers. The dating is a simulation built
// from public professional/social presence; an agent should never mention someone's actual partner.
const PERSONAL_PARTNER =
  /\b(my|his|her|their|our|your)\s+(?:\w+\s+)?(wife|husband|spouse|partner in life|life partner|girlfriend|boyfriend|fianc\S*|bride|groom|wedding|marriage|anniversary|honeymoon)\b|\bmarried\s+(to|with)\b|\b(wife|husband)\s+[A-Z][a-z]+\b|\b(my|his|her|our)\s+(late\s+)?(husband|wife)\b|\b(is|are|was|happily|newly|recently|got)\s+(married|engaged)\b/i;

const OMITTED = "(personal detail omitted)";

export function mentionsPartner(s: string): boolean {
  return PERSONAL_PARTNER.test(s);
}

/** Drop the clauses that mention a real partner; keep a leading source ref (e.g. "ig-post-6:") if present. */
export function scrubText(s: string): string {
  if (!mentionsPartner(s)) return s;
  const ref = s.match(/^\s*((?:li|ig)-[a-z]+(?:-\d+)?)\s*[:—-]/i)?.[1];
  const clauses = s.split(/(?<=[.!?;])\s+|\s+[—–]\s+|,\s+(?=and\s|but\s|while\s|with\s)/);
  const kept = clauses.filter((c) => !mentionsPartner(c)).join(" ").trim();
  if (kept.replace(/^\s*(?:li|ig)-[a-z]+(?:-\d+)?\s*[:—-]?\s*/i, "").length > 12) return kept;
  return ref ? `${ref}: ${OMITTED}` : OMITTED;
}

export function scrubDeep<T>(v: T): T {
  if (typeof v === "string") return scrubText(v) as T;
  if (Array.isArray(v)) return v.map(scrubDeep) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x)])) as T;
  return v;
}
