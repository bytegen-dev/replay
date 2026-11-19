import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http.ts";
import { parseStockSearch, searchStocks } from "@/lib/stocks.ts";

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ hits: [] });
  if (q.length > 60) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  try {
    const hits = parseStockSearch(await searchStocks(q));
    return NextResponse.json({ hits }, { headers: { "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    const limited = e instanceof HttpError && e.status === 429;
    return NextResponse.json(
      { error: limited ? "Stock search is busy right now. Type the ticker directly, e.g. AAPL." : "Stock search is unavailable right now. Type the ticker directly, e.g. AAPL." },
      { status: limited ? 429 : 502 },
    );
  }
}
