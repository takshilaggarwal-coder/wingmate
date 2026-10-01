import { fetchImageDataUrl, getItems, getRun, normalizeInstagram, normalizeLinkedIn, TERMINAL } from "@/lib/apify";
import { jsonError } from "@/lib/server";
import type { RawSources } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Runs = { linkedinProfile: string; linkedinPosts: string; instagram: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { runs?: Runs; li?: { url: string }; ig?: { url: string } };
  if (!body.runs || !body.li || !body.ig) return jsonError("missing runs");
  try {
    const [p, posts, insta] = await Promise.all([
      getRun(body.runs.linkedinProfile, 8),
      getRun(body.runs.linkedinPosts, 8),
      getRun(body.runs.instagram, 8),
    ]);
    const status = { linkedinProfile: p.status, linkedinPosts: posts.status, instagram: insta.status };
    if (![p, posts, insta].every((r) => TERMINAL.has(r.status))) return Response.json({ done: false, status });

    if (p.status !== "SUCCEEDED") return Response.json({ done: true, status, error: "LinkedIn scrape failed. Is the profile public and the link correct?" });
    if (insta.status !== "SUCCEEDED") return Response.json({ done: true, status, error: "Instagram scrape failed. Is the account public?" });

    const [liItems, postItems, igItems] = await Promise.all([
      getItems(p.defaultDatasetId),
      posts.status === "SUCCEEDED" ? getItems(posts.defaultDatasetId) : Promise.resolve([]),
      getItems(insta.defaultDatasetId),
    ]);
    if (!liItems[0]) return Response.json({ done: true, status, error: "LinkedIn returned no profile for that link." });
    if (!igItems[0]) return Response.json({ done: true, status, error: "Instagram returned no profile for that username." });
    const linkedin = normalizeLinkedIn(body.li.url, liItems[0], postItems);
    const instagram = normalizeInstagram(body.ig.url, igItems[0]);
    if (instagram.isPrivate) return Response.json({ done: true, status, error: "This Instagram account is private — only public profiles can be used." });

    const raw: RawSources = { linkedin, instagram, scrapedAt: new Date().toISOString() };
    const avatar = (await fetchImageDataUrl(instagram.profilePicUrl, 400_000)) || (await fetchImageDataUrl(linkedin.photoUrl, 400_000));
    return Response.json({ done: true, status, raw, avatar });
  } catch (e) {
    return jsonError((e as Error).message, 502);
  }
}
