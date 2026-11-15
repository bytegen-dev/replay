import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http.ts";
import { loadXStocks } from "@/lib/xstocksSource.ts";

export async function GET(request: Request) {
  // Reading the request keeps this route dynamic, so the list is never frozen at build time.
  void request.url;
  try {
    const stocks = await loadXStocks();
    return NextResponse.json({ stocks }, { headers: { "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    const limited = e instanceof HttpError && e.status === 429;
    return NextResponse.json(
      { error: limited ? "CoinGecko is rate limiting the stock list. Wait a minute and try again." : "Couldn't load the stock list. Try again." },
      { status: limited ? 429 : 502 },
    );
  }
}
