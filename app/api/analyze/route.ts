import { fetchImage } from "@/lib/apify";
import { analyzePerson, readPerson, type PostImage } from "@/lib/analyze";
import { ndjson, jsonError, rateLimit } from "@/lib/server";
import type { AnalyzeEvent, RawSources, ReadingNote } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const limited = rateLimit(req, "analyze", 20);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { raw?: RawSources };
  const raw = body.raw;
  if (!raw?.linkedin || !raw?.instagram) return jsonError("missing sources");

  async function* run(): AsyncGenerator<AnalyzeEvent> {
    yield { type: "status", message: "Looking at the photos…" };
    const images: PostImage[] = [];
    await Promise.all(
      raw!.instagram.posts.slice(0, 8).map(async (p) => {
        const img = p.imageUrl ? await fetchImage(p.imageUrl, 3_000_000) : null;
        if (img && /jpeg|png/.test(img.type)) images.push({ ref: p.ref, dataUrl: `data:${img.type};base64,${img.bytes.toString("base64")}` });
      }),
    );
    images.sort((a, b) => Number(a.ref.split("-").pop()) - Number(b.ref.split("-").pop()));
    yield { type: "status", message: `Reading LinkedIn and Instagram (${images.length} photos)…` };
    const notes: ReadingNote[] = [];
    for await (const note of readPerson(raw!, images.slice(0, 6))) {
      notes.push(note);
      yield { type: "note", note };
    }
    yield { type: "status", message: "Writing the dossier…" };
    const analysis = await analyzePerson(raw!, notes);
    yield { type: "analysis", analysis };
  }
  return ndjson(run());
}
