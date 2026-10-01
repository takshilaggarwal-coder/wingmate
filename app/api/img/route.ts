import { fetchImage, isAllowedImageHost } from "@/lib/apify";

// Image proxy for Instagram/LinkedIn CDN images (they can't be hot-linked from another origin).
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") || "";
  if (!isAllowedImageHost(u)) return new Response("not allowed", { status: 400 });
  const img = await fetchImage(u, 6_000_000);
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable" },
  });
}
