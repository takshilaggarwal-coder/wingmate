// LLM layer: any OpenAI-compatible provider, defaulting to free ones.
// Set one or more keys (NVIDIA_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, ...). The first available provider
// (or LLM_PROVIDER) is primary; the others are automatic fallbacks when a provider is rate-limited or down.
import OpenAI from "openai";
import type { ChatCompletionContentPart, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { z } from "zod";

interface Preset {
  baseURL: string;
  keyEnv: string;
  model: string; // agent turns, analysis
  visionModel?: string; // reading photos (falls back to text-only if absent)
  rpm: number; // free-tier requests per minute we stay under
  jsonSchema: boolean; // supports response_format json_schema
  label: string;
}

export const PRESETS: Record<string, Preset> = {
  nvidia: {
    label: "NVIDIA NIM (free)",
    baseURL: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    model: "meta/llama-3.3-70b-instruct",
    visionModel: "meta/llama-4-maverick-17b-128e-instruct",
    rpm: 38,
    jsonSchema: false,
  },
  gemini: {
    label: "Google Gemini (free tier)",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyEnv: "GEMINI_API_KEY",
    model: "gemini-flash-lite-latest",
    visionModel: "gemini-flash-lite-latest",
    rpm: 14,
    jsonSchema: true,
  },
  groq: {
    label: "Groq (free tier)",
    baseURL: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    model: "openai/gpt-oss-120b",
    rpm: 28,
    jsonSchema: true,
  },
  cerebras: {
    label: "Cerebras (free tier)",
    baseURL: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    model: "gpt-oss-120b",
    rpm: 28,
    jsonSchema: true,
  },
  openrouter: {
    label: "OpenRouter (free models)",
    baseURL: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    rpm: 18,
    jsonSchema: false,
  },
  mistral: {
    label: "Mistral (free credits)",
    baseURL: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    model: "mistral-small-latest",
    visionModel: "mistral-small-latest",
    rpm: 50,
    jsonSchema: true,
  },
  xai: {
    label: "xAI Grok",
    baseURL: "https://api.x.ai/v1",
    keyEnv: "XAI_API_KEY",
    model: "grok-4.7",
    visionModel: "grok-4.7",
    rpm: 120,
    jsonSchema: true,
  },
  ollama: {
    label: "Ollama (local)",
    baseURL: "http://localhost:11434/v1",
    keyEnv: "OLLAMA",
    model: "llama3.1",
    rpm: 600,
    jsonSchema: false,
  },
};

interface Provider extends Preset {
  name: string;
  client: OpenAI;
  agentModel: string;
  jsonMode: "schema" | "object" | "none";
}

let _providers: Provider[] | null = null;

function buildProviders(): Provider[] {
  const order = Object.keys(PRESETS);
  const primary = process.env.LLM_PROVIDER;
  if (primary && order.includes(primary)) order.sort((a, b) => (a === primary ? -1 : b === primary ? 1 : 0));
  const out: Provider[] = [];
  // Fully custom OpenAI-compatible endpoint
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    const model = process.env.LLM_MODEL || "gpt-4o-mini";
    out.push({
      name: "custom",
      label: "Custom",
      baseURL: process.env.LLM_BASE_URL,
      keyEnv: "LLM_API_KEY",
      model,
      visionModel: process.env.LLM_VISION_MODEL,
      rpm: Number(process.env.LLM_RPM || 30),
      jsonSchema: process.env.LLM_JSON_SCHEMA === "1",
      client: new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL: process.env.LLM_BASE_URL, maxRetries: 3, timeout: 180_000 }),
      agentModel: process.env.LLM_AGENT_MODEL || model,
      jsonMode: process.env.LLM_JSON_SCHEMA === "1" ? "schema" : "object",
    });
  }
  for (const name of order) {
    const p = PRESETS[name];
    const key = name === "ollama" ? (process.env.OLLAMA_BASE_URL ? "ollama" : "") : process.env[p.keyEnv];
    if (!key) continue;
    const isPrimary = out.length === 0;
    const model = (isPrimary && process.env.LLM_MODEL) || p.model;
    out.push({
      ...p,
      name,
      baseURL: name === "ollama" && process.env.OLLAMA_BASE_URL ? process.env.OLLAMA_BASE_URL : p.baseURL,
      model,
      visionModel: (isPrimary && process.env.LLM_VISION_MODEL) || p.visionModel,
      rpm: Number((isPrimary && process.env.LLM_RPM) || p.rpm),
      client: new OpenAI({ apiKey: key, baseURL: name === "ollama" && process.env.OLLAMA_BASE_URL ? process.env.OLLAMA_BASE_URL : p.baseURL, maxRetries: 3, timeout: 180_000 }),
      agentModel: (isPrimary && process.env.LLM_AGENT_MODEL) || model,
      jsonMode: p.jsonSchema ? "schema" : "object",
    });
  }
  return out;
}

export function providers(): Provider[] {
  if (!_providers) _providers = buildProviders();
  return _providers;
}

export function llmConfigured(): boolean {
  return providers().length > 0;
}

export function modelLabel(): string {
  const p = providers()[0];
  return p ? `${p.label} · ${p.agentModel}` : "not configured";
}

// ---------- Pacing: stay under each provider's free-tier RPM ----------

const MAX_CONCURRENT = Number(process.env.LLM_CONCURRENCY || 8);
let active = 0;
const waiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

const nextFree = new Map<string, number>();
async function pace(p: Provider) {
  const gap = 60_000 / Math.max(1, p.rpm);
  const now = Date.now();
  const at = Math.max(now, nextFree.get(p.name) || 0);
  nextFree.set(p.name, at + gap);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

const cooldown = new Map<string, number>(); // provider -> until timestamp

function isRetryable(e: unknown): boolean {
  const s = (e as { status?: number }).status;
  return s === 429 || s === 408 || s === 409 || (typeof s === "number" && s >= 500) || s === undefined;
}

/** Try each provider in order; skip ones cooling down after rate limits. */
async function withProviders<T>(fn: (p: Provider) => Promise<T>): Promise<T> {
  const list = providers();
  if (!list.length) throw new Error("No LLM API key configured. Set NVIDIA_API_KEY (free at build.nvidia.com) or another provider key.");
  let lastErr: unknown;
  for (let round = 0; round < 3; round++) {
    for (const p of list) {
      if ((cooldown.get(p.name) || 0) > Date.now() && list.length > 1) continue;
      try {
        return await withSlot(async () => {
          await pace(p);
          return fn(p);
        });
      } catch (e) {
        lastErr = e;
        if (!isRetryable(e)) throw e;
        cooldown.set(p.name, Date.now() + 30_000);
      }
    }
    await new Promise((r) => setTimeout(r, 4000 * (round + 1)));
  }
  throw lastErr;
}

export const usage = { calls: 0, input: 0, output: 0 };

// ---------- JSON helpers ----------

function extractJson(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(t.slice(start, end + 1));
}

/** Light coercion so small models' near-misses ("7" instead of 7, a single string instead of a list) still validate. */
function coerce(value: unknown, schema: Record<string, unknown>): unknown {
  const type = schema.type;
  if (type === "number" || type === "integer") {
    const n = typeof value === "string" ? parseFloat(value) : value;
    return typeof n === "number" && isFinite(n) ? n : 0;
  }
  if (type === "boolean") return typeof value === "string" ? /^(true|yes|1)$/i.test(value) : !!value;
  if (type === "string") {
    if (typeof value === "string") {
      const en = schema.enum as string[] | undefined;
      if (en && !en.includes(value)) return en.find((x) => x.toLowerCase() === value.toLowerCase().trim()) ?? value;
      return value;
    }
    return value === undefined || value === null ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  }
  if (type === "array") {
    const items = (schema.items || {}) as Record<string, unknown>;
    const arr = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
    const mapped = arr.map((v) => coerce(v, items));
    const en = (items.enum as string[] | undefined) || undefined;
    return en ? mapped.filter((v) => en.includes(v as string)) : mapped;
  }
  if (type === "object" && value && typeof value === "object") {
    const props = (schema.properties || {}) as Record<string, Record<string, unknown>>;
    const o: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(props)) o[k] = coerce((value as Record<string, unknown>)[k], s);
    return o;
  }
  if (type === "object") return coerce({}, schema);
  return value;
}

/** One structured call: the reply is parsed and validated against the zod schema (with one repair retry). */
export async function structured<S extends z.ZodType>(opts: {
  system: string;
  user: string | ChatCompletionContentPart[];
  schema: S;
  name: string;
  model?: "agent" | "analyst";
  temperature?: number;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const schemaText = JSON.stringify(jsonSchema);

  return withProviders(async (p) => {
    const model = opts.model === "analyst" ? p.model : p.agentModel;
    let feedback = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const system =
        opts.system +
        `\n\nRespond with a single JSON object only (no prose, no code fences) that matches this JSON schema:\n${schemaText}` +
        (feedback ? `\n\nYour previous reply was invalid (${feedback}). Fix it.` : "");
      const params: ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 2000,
      };
      if (p.jsonMode === "schema") params.response_format = { type: "json_schema", json_schema: { name: opts.name, schema: jsonSchema, strict: false } };
      else if (p.jsonMode === "object") params.response_format = { type: "json_object" };
      let res;
      try {
        res = await p.client.chat.completions.create(params);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 400 && p.jsonMode !== "none") {
          // This endpoint/model doesn't support that response_format: step down and retry.
          p.jsonMode = p.jsonMode === "schema" ? "object" : "none";
          continue;
        }
        throw e;
      }
      usage.calls++;
      usage.input += res.usage?.prompt_tokens || 0;
      usage.output += res.usage?.completion_tokens || 0;
      const text = res.choices[0]?.message?.content || "";
      try {
        const raw = coerce(extractJson(text), jsonSchema);
        const parsed = opts.schema.safeParse(raw);
        if (parsed.success) return parsed.data;
        feedback = parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
      } catch (e) {
        feedback = (e as Error).message;
      }
    }
    throw new Error(`Model returned no valid ${opts.name}: ${feedback}`);
  });
}

/** Streamed plain-text call; yields text deltas. Uses the vision model when images are attached. */
export async function* streamText(opts: { system: string; user: string | ChatCompletionContentPart[]; temperature?: number; maxTokens?: number }): AsyncGenerator<string> {
  const hasImages = Array.isArray(opts.user) && opts.user.some((p) => p.type === "image_url");
  const stream = await withProviders(async (p) => {
    const model = hasImages ? p.visionModel : p.model;
    if (!model) {
      const err = new Error("no vision model") as Error & { status: number };
      err.status = 400;
      throw err;
    }
    const s = await p.client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 3000,
      stream: true,
    });
    usage.calls++;
    return s;
  });
  let inThink = false;
  for await (const chunk of stream) {
    let d = chunk.choices[0]?.delta?.content || "";
    if (!d) continue;
    // hide reasoning blocks from models that think out loud
    if (d.includes("<think>")) inThink = true;
    if (inThink) {
      if (d.includes("</think>")) {
        inThink = false;
        d = d.split("</think>").pop() || "";
      } else continue;
    }
    if (d) yield d;
  }
}
