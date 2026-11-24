import { connection, NextResponse } from "next/server";
import { HELIUS_THUMBNAILS } from "@/lib/fumble/tokens.ts";

/**
 * A coin's picture, passed through this site so the share picture can draw it (a canvas can only be saved if every picture on it came from the
 * same origin or gave permission, and Helius's image server doesn't).
 *
 *   GET /api/fumble/image?src=<a thumbnail address from the scan>   ->   the image
 *
 * Only the thumbnail addresses a scan hands out (Helius's own image proxy, at the size the scan asks for) are fetched, so this can't be pointed at
 * anywhere else. The answer must be a small bitmap image.
 */
const MAX_BYTES = 600_000;

export async function GET(request: Request) {
  await connection();
  const src = new URL(request.url).searchParams.get("src") ?? "";
  if (src.length > 800 || !src.startsWith(HELIUS_THUMBNAILS)) return new NextResponse(null, { status: 400 });
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(5000), redirect: "error" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(png|jpe?g|webp|gif|avif)/i.test(type)) return new NextResponse(null, { status: 404 });
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new NextResponse(null, { status: 404 });
    return new NextResponse(bytes, { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
