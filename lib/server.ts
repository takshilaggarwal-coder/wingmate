// Server-only helpers for API routes: NDJSON streaming + a light per-IP rate limit.
export function ndjson(gen: AsyncGenerator<unknown>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of gen) controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      } catch (e) {
        controller.enqueue(enc.encode(JSON.stringify({ type: "error", message: (e as Error).message || "Something went wrong" }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

const buckets = new Map<string, { count: number; reset: number }>();

/** Returns an error Response when the caller exceeded `limit` requests per hour for this bucket. */
export function rateLimit(req: Request, bucket: string, limit: number): Response | null {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + 3600_000 });
    return null;
  }
  b.count++;
  if (b.count > limit) {
    return Response.json({ error: `Rate limit reached for ${bucket}. Try again in ${Math.ceil((b.reset - now) / 60000)} min.` }, { status: 429 });
  }
  return null;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
