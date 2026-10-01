import { runFullDate } from "@/lib/dating";
import { ndjson, jsonError, rateLimit } from "@/lib/server";
import type { AgentInput, Invitation, SpeedDate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const limited = rateLimit(req, "date", 60);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { a?: AgentInput; b?: AgentInput; invitation?: Invitation; speedDate?: SpeedDate };
  if (!body.a?.analysis || !body.b?.analysis || !body.invitation) return jsonError("two agents and an invitation required");
  return ndjson(runFullDate(body.a, body.b, body.invitation, body.speedDate));
}
