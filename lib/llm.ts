// LLM layer: xAI Grok through its OpenAI-compatible API.
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { z } from "zod";

export const MODEL = process.env.XAI_MODEL || "grok-4.7";
export const AGENT_MODEL = process.env.XAI_AGENT_MODEL || MODEL;

let _client: OpenAI | null = null;
export function llm(): OpenAI {
  if (!process.env.XAI_API_KEY) throw new Error("XAI_API_KEY is not configured on the server.");
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
      maxRetries: 6,
      timeout: 180_000,
    });
  }
  return _client;
}

// A small semaphore so bursts (25 speed dates at once) stay under rate limits.
const MAX_CONCURRENT = Number(process.env.LLM_CONCURRENCY || 12);
let active = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

export interface UsageTotals {
  calls: number;
  input: number;
  output: number;
}
export const usage: UsageTotals = { calls: 0, input: 0, output: 0 };

/** One structured call: the reply is guaranteed to match the zod schema. */
export async function structured<S extends z.ZodType>(opts: {
  system: string;
  user: string | ChatCompletionContentPart[];
  schema: S;
  name: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await slot(() =>
      llm().chat.completions.parse({
        model: opts.model || AGENT_MODEL,
        messages,
        response_format: zodResponseFormat(opts.schema, opts.name),
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 4000,
      }),
    );
    usage.calls++;
    usage.input += res.usage?.prompt_tokens || 0;
    usage.output += res.usage?.completion_tokens || 0;
    const parsed = res.choices[0]?.message?.parsed;
    if (parsed) return parsed as z.infer<S>;
  }
  throw new Error(`Model returned no parseable ${opts.name}`);
}

/** Streamed plain-text call; yields text deltas. */
export async function* streamText(opts: {
  system: string;
  user: string | ChatCompletionContentPart[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const stream = await slot(() =>
    llm().chat.completions.create({
      model: opts.model || MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 4000,
      stream: true,
    }),
  );
  usage.calls++;
  for await (const chunk of stream) {
    const d = chunk.choices[0]?.delta?.content;
    if (d) yield d;
  }
}
