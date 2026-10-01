// LLM layer: any OpenAI-compatible provider, built for FREE tiers.
// Default: Google AI Studio (Gemini API) — one free key, several models with separate free quotas.
// Each provider has a pool of models; when one is rate-limited or out of daily quota we rotate to the
// next model, then to the next provider (if more keys are set).
import OpenAI from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";

interface ModelSpec {
  id: string;
  rpm: number;
  vision?: boolean;
  jsonSchema?: boolean;
  noSystem?: boolean; // some models reject system instructions
  role?: "analyst"; // reserved for the deeper reads (profiles), so their small daily quota isn't spent on chit-chat
  reasoning?: "low" | "none"; // thinking models: keep thinking short so replies don't get cut off
}

interface Preset {
  label: string;
  baseURL: string;
  keyEnv: string;
  models: ModelSpec[];
}

export const PRESETS: Record<string, Preset> = {
  gemini: {
    label: "Google Gemini API (free tier)",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyEnv: "GEMINI_API_KEY",
    models: [
      { id: "gemini-3.8-flash", rpm: 8, vision: true, jsonSchema: true, role: "analyst", reasoning: "low" },
      { id: "gemini-3-flash-preview", rpm: 8, vision: true, jsonSchema: true, role: "analyst", reasoning: "low" },
      { id: "gemini-3.5-flash-lite", rpm: 14, vision: true, jsonSchema: true },
      { id: "gemma-4-26b-a4b-it", rpm: 4, vision: true, jsonSchema: true }, // Gemma's free tier is token-limited per minute
      { id: "gemini-3.1-flash-lite", rpm: 14, vision: true, jsonSchema: true },
      { id: "gemini-flash-lite-latest", rpm: 14, vision: true, jsonSchema: true },
      { id: "gemini-3.1-flash-lite-preview", rpm: 10, vision: true, jsonSchema: true },
    ],
  },
  groq: {
    label: "Groq (free tier)",
    baseURL: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    models: [
      { id: "openai/gpt-oss-120b", rpm: 5, jsonSchema: true },
      { id: "qwen/qwen3.8-27b", rpm: 5 },
      { id: "openai/gpt-oss-20b", rpm: 5, jsonSchema: true },
    ],
  },
  nvidia: {
    label: "NVIDIA NIM (free)",
    baseURL: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    models: [{ id: "deepseek-ai/deepseek-v4.1-flash", rpm: 38, vision: true }],
  },
  cerebras: {
    label: "Cerebras (free tier)",
    baseURL: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    models: [{ id: "gpt-oss-120b", rpm: 25, jsonSchema: true }],
  },
  openrouter: {
    label: "OpenRouter (free models)",
    baseURL: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    models: [{ id: "meta-llama/llama-3.3-70b-instruct:free", rpm: 15 }],
  },
  mistral: {
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    models: [{ id: "mistral-small-latest", rpm: 50, vision: true, jsonSchema: true }],
  },
  xai: {
    label: "xAI Grok",
    baseURL: "https://api.x.ai/v1",
    keyEnv: "XAI_API_KEY",
    models: [{ id: "grok-4.7", rpm: 120, vision: true, jsonSchema: true }],
  },
};

interface Slot {
  provider: string;
  label: string;
  client: OpenAI;
  id: string;
  rpm: number;
  vision: boolean;
  jsonMode: "schema" | "object" | "none";
  noSystem: boolean;
  role?: "analyst";
  reasoning?: "low" | "none";
  nextFree: number;
  coolUntil: number;
  latency: number; // moving average of response time (ms) — slow/congested models get used less
}

let _slots: Slot[] | null = null;

function buildSlots(): Slot[] {
  const names = Object.keys(PRESETS);
  const primary = process.env.LLM_PROVIDER;
  if (primary && names.includes(primary)) names.sort((a, b) => (a === primary ? -1 : b === primary ? 1 : 0));
  const slots: Slot[] = [];
  const add = (provider: string, label: string, client: OpenAI, m: ModelSpec) =>
    slots.push({
      provider,
      label,
      client,
      id: m.id,
      rpm: m.rpm,
      vision: !!m.vision,
      jsonMode: m.jsonSchema ? "schema" : "object",
      noSystem: !!m.noSystem,
      role: m.role,
      reasoning: m.reasoning,
      nextFree: 0,
      coolUntil: 0,
      latency: 3000,
    });

  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    const client = new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL: process.env.LLM_BASE_URL, maxRetries: 0, timeout: Number(process.env.LLM_TIMEOUT_MS || 45_000) });
    for (const id of (process.env.LLM_MODELS || process.env.LLM_MODEL || "gpt-4o-mini").split(",").map((s) => s.trim()).filter(Boolean))
      add("custom", "Custom endpoint", client, { id, rpm: Number(process.env.LLM_RPM || 30), vision: process.env.LLM_VISION === "1", jsonSchema: process.env.LLM_JSON_SCHEMA === "1" });
  }
  const firstKeyed = names.find((n) => process.env[PRESETS[n].keyEnv]);
  for (const name of names) {
    const p = PRESETS[name];
    const key = process.env[p.keyEnv];
    if (!key) continue;
    const client = new OpenAI({ apiKey: key, baseURL: p.baseURL, maxRetries: 0, timeout: Number(process.env.LLM_TIMEOUT_MS || 45_000) });
    const override = name === firstKeyed ? process.env.LLM_MODELS : undefined;
    const models = override
      ? override.split(",").map((id) => p.models.find((m) => m.id === id.trim()) || { id: id.trim(), rpm: 10, vision: true })
      : p.models;
    for (const m of models) add(name, p.label, client, m);
  }
  return slots;
}

function slots(): Slot[] {
  if (!_slots) _slots = buildSlots();
  return _slots;
}

export function llmConfigured(): boolean {
  return slots().length > 0;
}

export function modelLabel(): string {
  const s = slots();
  if (!s.length) return "not configured";
  const byProvider = new Map<string, string[]>();
  for (const x of s) byProvider.set(x.label, [...(byProvider.get(x.label) || []), x.id]);
  return [...byProvider.entries()].map(([l, ids]) => `${l}: ${ids.join(", ")}`).join(" · ");
}

// ---------- Scheduling ----------

const MAX_CONCURRENT = Number(process.env.LLM_CONCURRENCY || 4); // free tiers stall when flooded with parallel requests
let active = 0;
const waiters: (() => void)[] = [];
async function withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pick the usable slot that frees up soonest (config order breaks ties) and reserve a request on it. */
async function acquire(needVision: boolean, exclude: Set<Slot>, role: Role): Promise<Slot | null> {
  const now = Date.now();
  const all = slots().filter((s) => !exclude.has(s) && (!needVision || s.vision));
  if (!all.length) return null;
  // Analyst work prefers the stronger "analyst" models; agent chatter stays off them while others are available.
  const preferred = all.filter((s) => (role === "analyst" ? s.role === "analyst" : s.role !== "analyst"));
  const readyPreferred = preferred.filter((s) => s.coolUntil <= now);
  const readyAll = all.filter((s) => s.coolUntil <= now);
  const pool = readyPreferred.length ? readyPreferred : readyAll.length ? readyAll : preferred.length ? preferred : all;
  // Earliest expected finish = when the slot is free to send + how long it has recently taken to answer.
  const cost = (s: Slot) => Math.max(now, s.nextFree, s.coolUntil) + s.latency;
  let best = pool[0];
  for (const s of pool) if (cost(s) < cost(best) - 300) best = s;
  const at = Math.max(now, best.nextFree, best.coolUntil);
  best.nextFree = at + 60_000 / Math.max(1, best.rpm);
  if (at > now) await sleep(Math.min(at - now, 120_000));
  return best;
}

function errInfo(e: unknown): { status?: number; message: string } {
  const err = e as { status?: number; message?: string; error?: { message?: string } };
  return { status: err.status, message: `${err.message || ""} ${err.error?.message || ""}` };
}

/** Run fn on a model slot; rotate across models/providers on rate limits, quota exhaustion and outages. */
type Role = "agent" | "analyst";

async function run<T>(needVision: boolean, role: Role, fn: (s: Slot) => Promise<T>): Promise<T> {
  if (!slots().length) throw new Error("No LLM API key configured. Set GEMINI_API_KEY (free at aistudio.google.com/apikey) or another provider key.");
  return withConcurrency(async () => {
    let lastErr: unknown;
    const tried = new Set<Slot>();
    for (let attempt = 0; attempt < 10; attempt++) {
      const slot = await acquire(needVision, tried.size >= slots().length ? new Set() : tried, role);
      if (!slot) break;
      tried.add(slot);
      const started = Date.now();
      try {
        const out = await fn(slot);
        slot.latency = slot.latency * 0.7 + (Date.now() - started) * 0.3;
        return out;
      } catch (e) {
        lastErr = e;
        slot.latency = slot.latency * 0.5 + (Date.now() - started) * 0.5;
        const { status, message } = errInfo(e);
        if (process.env.LLM_DEBUG) console.warn(`[llm] ${slot.id} → ${status}: ${message.slice(0, 140)}`);
        if (status === 429) {
          const daily = /per.?day|daily|RPD|quota/i.test(message);
          slot.coolUntil = Date.now() + (daily ? 60 * 60_000 : 45_000);
          continue;
        }
        if (status === 404 || (status === 400 && /model/i.test(message) && /not found|not supported|unknown|invalid/i.test(message))) {
          slot.coolUntil = Date.now() + 24 * 3600_000; // model isn't available for this key — stop using it
          continue;
        }
        if (status === undefined || status >= 500 || status === 408) {
          slot.coolUntil = Date.now() + 90_000; // timed out / overloaded: give it a rest
          await sleep(1500);
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error("All models are rate-limited right now. Try again in a minute.");
  });
}

export const usage = { calls: 0, input: 0, output: 0 };
const schemaTooComplex = new Set<string>(); // "model:schemaName" pairs that need plain JSON mode

// ---------- JSON helpers ----------

function extractJson(text: string): unknown {
  let t = text.replace(/<(think|thought|thinking)>[\s\S]*?<\/\1>/gi, "").replace(/^[\s\S]*<\/(think|thought|thinking)>/i, "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(t.slice(start, end + 1));
}

/** Light coercion so near-misses ("7" instead of 7, a string instead of a list) still validate. */
function coerce(value: unknown, schema: Record<string, unknown>): unknown {
  const type = schema.type;
  if (type === "number" || type === "integer") {
    const n = typeof value === "string" ? parseFloat(value) : value;
    return typeof n === "number" && isFinite(n) ? n : 0;
  }
  if (type === "boolean") return typeof value === "string" ? /^(true|yes|1)$/i.test(value) : !!value;
  if (type === "string") {
    const en = schema.enum as string[] | undefined;
    if (typeof value === "string") {
      if (en && !en.includes(value)) return en.find((x) => x.toLowerCase() === value.toLowerCase().trim()) ?? en[0];
      return value;
    }
    if (en) return en[0];
    return value === undefined || value === null ? "" : Array.isArray(value) ? value.join("; ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  if (type === "array") {
    const items = (schema.items || {}) as Record<string, unknown>;
    const arr = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
    const en = items.enum as string[] | undefined;
    if (en) return arr.map((v) => (typeof v === "string" ? en.find((x) => x.toLowerCase() === v.toLowerCase().trim()) : undefined)).filter(Boolean);
    return arr.map((v) => coerce(v, items));
  }
  if (type === "object") {
    const props = (schema.properties || {}) as Record<string, Record<string, unknown>>;
    const src = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const o: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(props)) o[k] = coerce(src[k], s);
    return o;
  }
  return value;
}

function messagesFor(slot: Slot, system: string, user: string | ChatCompletionContentPart[]): ChatCompletionMessageParam[] {
  if (!slot.noSystem) {
    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }
  // Models without a system role: put the instructions at the top of the user turn.
  const parts: ChatCompletionContentPart[] = typeof user === "string" ? [{ type: "text", text: user }] : user;
  return [{ role: "user", content: [{ type: "text", text: `INSTRUCTIONS:\n${system}\n\n---\n` }, ...parts] }];
}

/** One structured call: the reply is parsed, coerced and validated against the zod schema, with repair retries. */
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
  const needVision = Array.isArray(opts.user) && opts.user.some((p) => p.type === "image_url");
  let feedback = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await run(needVision, opts.model === "analyst" ? "analyst" : "agent", async (slot) => {
      for (let step = 0; step < 3; step++) {
        const system =
          opts.system +
          `\n\nRespond with a single JSON object only (no prose, no code fences) that matches this JSON schema:\n${schemaText}` +
          (feedback ? `\n\nYour previous reply was invalid (${feedback}). Fix it and return the full object.` : "");
        const params: ChatCompletionCreateParamsNonStreaming = {
          model: slot.id,
          messages: messagesFor(slot, system, opts.user),
          temperature: opts.temperature ?? 0.8,
          max_tokens: (opts.maxTokens ?? 2000) + (slot.reasoning ? 3000 : 0),
        };
        if (slot.reasoning) (params as unknown as Record<string, unknown>).reasoning_effort = slot.reasoning;
        const mode = slot.jsonMode === "schema" && schemaTooComplex.has(`${slot.id}:${opts.name}`) ? "object" : slot.jsonMode;
        if (mode === "schema") params.response_format = { type: "json_schema", json_schema: { name: opts.name, schema: jsonSchema, strict: false } };
        else if (mode === "object") params.response_format = { type: "json_object" };
        try {
          const res = await slot.client.chat.completions.create(params);
          usage.calls++;
          usage.input += res.usage?.prompt_tokens || 0;
          usage.output += res.usage?.completion_tokens || 0;
          return res.choices[0]?.message?.content || "";
        } catch (e) {
          const { status, message } = errInfo(e);
          if (status === 400 && /system|developer instruction/i.test(message) && !slot.noSystem) {
            slot.noSystem = true; // this model has no system role: inline the instructions
            continue;
          }
          if (status === 400 && slot.jsonMode !== "none") {
            // Strict schemas can be too complex for some endpoints ("invalid argument"): step down to plain JSON
            // mode for this request — the reply is still validated against the zod schema below.
            if (slot.jsonMode === "schema" && !/response.?format|json|schema|mime/i.test(message)) {
              schemaTooComplex.add(`${slot.id}:${opts.name}`);
            } else {
              slot.jsonMode = slot.jsonMode === "schema" ? "object" : "none";
            }
            continue;
          }
          throw e;
        }
      }
      throw new Error("request rejected by model");
    });
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
}

/** Streamed plain-text call; yields text deltas. Picks a vision-capable model when images are attached. */
export async function* streamText(opts: { system: string; user: string | ChatCompletionContentPart[]; temperature?: number; maxTokens?: number; role?: Role }): AsyncGenerator<string> {
  const needVision = Array.isArray(opts.user) && opts.user.some((p) => p.type === "image_url");
  if (needVision && !slots().some((s) => s.vision)) {
    const err = new Error("no vision model configured") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  const stream = await run(needVision, opts.role || "analyst", async (slot) => {
    const s = await slot.client.chat.completions.create({
      model: slot.id,
      messages: messagesFor(slot, opts.system, opts.user),
      temperature: opts.temperature ?? 0.5,
      max_tokens: (opts.maxTokens ?? 3000) + (slot.reasoning ? 3000 : 0),
      stream: true,
      ...(slot.reasoning ? { reasoning_effort: slot.reasoning } : {}),
    } as ChatCompletionCreateParamsStreaming);
    usage.calls++;
    return s;
  });
  let inThink = false;
  for await (const chunk of stream) {
    let d = chunk.choices[0]?.delta?.content || "";
    if (!d) continue;
    if (/<(think|thought|thinking)>/.test(d)) inThink = true;
    if (inThink) {
      const close = d.match(/<\/(think|thought|thinking)>/);
      if (close) {
        inThink = false;
        d = d.slice((close.index || 0) + close[0].length);
      } else continue;
    }
    if (d) yield d;
  }
}
