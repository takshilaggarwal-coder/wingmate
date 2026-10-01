import { MODEL } from "@/lib/llm";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ apify: !!process.env.APIFY_TOKEN, llm: !!process.env.XAI_API_KEY, model: MODEL });
}
