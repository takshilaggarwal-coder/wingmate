import { parseInstagramUrl, parseLinkedInUrl, startRun } from "@/lib/apify";
import { jsonError, rateLimit } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = rateLimit(req, "scrape", 15);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { linkedin?: string; instagram?: string };
  const li = parseLinkedInUrl(body.linkedin || "");
  const ig = parseInstagramUrl(body.instagram || "");
  if (!li) return jsonError("That doesn't look like a LinkedIn profile link (linkedin.com/in/…).");
  if (!ig) return jsonError("That doesn't look like an Instagram profile link (instagram.com/username).");
  try {
    const [p, posts, insta] = await Promise.all([
      startRun("linkedinProfile", li.url),
      startRun("linkedinPosts", li.url),
      startRun("instagram", ig.username),
    ]);
    return Response.json({ li, ig, runs: { linkedinProfile: p.id, linkedinPosts: posts.id, instagram: insta.id } });
  } catch (e) {
    return jsonError((e as Error).message, 502);
  }
}
