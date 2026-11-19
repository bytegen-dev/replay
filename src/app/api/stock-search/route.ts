import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http.ts";
import { searchLocalStocks } from "@/lib/localStocks.ts";
import { parseStockSearch, searchStocks, type StockHit } from "@/lib/stocks.ts";

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ hits: [] });
  if (q.length > 60) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  // The saved list answers first and instantly. Yahoo is asked only when it found little, to reach listings abroad.
  const local = searchLocalStocks(q);
  const cache = { "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" };
  if (local.length >= 5) return NextResponse.json({ hits: local }, { headers: cache });
  try {
    const remote = parseStockSearch(await searchStocks(q));
    const seen = new Set(local.map((h) => h.symbol));
    const hits: StockHit[] = [...local, ...remote.filter((h) => !seen.has(h.symbol))].slice(0, 10);
    return NextResponse.json({ hits }, { headers: cache });
  } catch (e) {
    if (local.length > 0) return NextResponse.json({ hits: local });
    const limited = e instanceof HttpError && e.status === 429;
    return NextResponse.json(
      { error: limited ? "Stock search is busy right now. Type the ticker directly, e.g. AAPL." : "Stock search is unavailable right now. Type the ticker directly, e.g. AAPL." },
      { status: limited ? 429 : 502 },
    );
  }
}
