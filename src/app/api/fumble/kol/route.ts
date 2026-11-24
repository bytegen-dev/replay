import { connection, NextResponse } from "next/server";
import { getKolDirectory } from "@/lib/fumble/live.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/**
 * Well-known traders by name.
 *
 *   GET /api/fumble/kol?q=cupsey   ->   { "results": [{ "name": "Cupsey", "twitter": "Cupseyy", "wallet": "<address>" }] }
 *
 * Up to six matches, from a saved list that is refreshed once a day (Solana Tracker's KOL leaderboard). An empty list means nothing matched or
 * names can't be searched right now, and the page just offers nothing.
 */
export async function GET(request: Request) {
  await connection(); // read per request
  const headers = { "cache-control": "no-store" };
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 40) ?? "";
  const directory = getKolDirectory();
  if (q.length < 2 || !directory) return NextResponse.json({ results: [] }, { headers });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const allowed = await hitRateLimit(`fumble-kol:${hashSecret(ip).slice(0, 16)}`, 60, 60);
  if (!allowed.ok) return NextResponse.json({ results: [] }, { headers });

  try {
    return NextResponse.json({ results: await directory.search(q) }, { headers });
  } catch (e) {
    console.error("kol search failed:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ results: [] }, { headers });
  }
}
