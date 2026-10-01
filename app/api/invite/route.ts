import { runInvitation } from "@/lib/dating";
import { jsonError, rateLimit } from "@/lib/server";
import type { AgentInput, SpeedDate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const limited = rateLimit(req, "invite", 120);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { from?: AgentInput; to?: AgentInput; speedDate?: SpeedDate };
  if (!body.from?.analysis || !body.to?.analysis) return jsonError("two agents required");
  try {
    return Response.json(await runInvitation(body.from, body.to, body.speedDate));
  } catch (e) {
    return jsonError((e as Error).message, 502);
  }
}
