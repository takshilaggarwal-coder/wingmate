import { runSpeedDate } from "@/lib/dating";
import { ndjson, jsonError, rateLimit } from "@/lib/server";
import type { AgentInput } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const limited = rateLimit(req, "speed", 300);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { a?: AgentInput; b?: AgentInput; table?: number };
  if (!body.a?.analysis || !body.b?.analysis) return jsonError("two agents required");
  return ndjson(runSpeedDate(body.a, body.b, body.table || 1));
}
