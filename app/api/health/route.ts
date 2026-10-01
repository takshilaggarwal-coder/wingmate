import { llmConfigured, modelLabel } from "@/lib/llm";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ apify: !!process.env.APIFY_TOKEN, llm: llmConfigured(), model: modelLabel() });
}
