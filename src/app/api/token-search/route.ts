import { NextResponse } from "next/server";
import { getJson } from "@/lib/http.ts";
import { parseSearch, type DexSearchPair } from "@/lib/tokenSearch.ts";

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });
  if (q.length > 100) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  try {
    const d = await getJson<{ pairs?: DexSearchPair[] | null }>(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
    return NextResponse.json({ hits: parseSearch(d.pairs, q) }, { headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (e) {
    console.error("token-search failed", e);
    return NextResponse.json({ error: "Search is unavailable right now. Paste the address instead." }, { status: 502 });
  }
}
