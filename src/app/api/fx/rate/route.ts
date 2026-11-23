import { connection, NextResponse } from "next/server";
import { currencyByCode, isCurrency } from "@/lib/fxCurrencies.ts";
import { rateOn } from "@/lib/fx.ts";
import { getFxSeries } from "@/lib/fxSources.ts";
import { todayUtc } from "@/lib/months.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/**
 * Today's exchange rate of a currency against the dollar.
 *
 *   GET /api/fx/rate?code=NGN   ->   { "code": "NGN", "symbol": "₦", "perUsd": 1480.5, "date": "2026-11-23" }
 *
 * "perUsd" is units of the currency per 1 US dollar, and "date" is the day of that rate. The page uses it to show a result in the visitor's own
 * currency. The most recent rate on record counts as today's; where the newest one is more than about three months old the answer is 404.
 */
export async function GET(request: Request) {
  await connection();
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!isCurrency(code)) return NextResponse.json({ error: "Unknown currency." }, { status: 400 });
  const cur = currencyByCode(code)!;
  if (code === "USD") return NextResponse.json({ code, symbol: cur.symbol, perUsd: 1, date: todayUtc() }, { headers: { "cache-control": "public, max-age=3600" } });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const rate = await hitRateLimit(`fx-rate:${hashSecret(ip).slice(0, 16)}`, 30, 60);
  if (!rate.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "retry-after": String(rate.resetSeconds) } });

  try {
    const series = await getFxSeries(code);
    // Today's rate if the source has one; otherwise the latest on record, as long as it is not stale (some currencies only have a monthly official
    // rate). Its date goes with it, so the page can say how fresh the figure is.
    const exact = rateOn(series.points, todayUtc());
    const last = series.points[series.points.length - 1];
    const ageDays = last ? (Date.parse(`${todayUtc()}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / 86_400_000 : Infinity;
    const used = exact ?? (last && ageDays <= 100 ? { perUsd: last.perUsd, date: last.date } : null);
    if (!used) return NextResponse.json({ error: "No recent rate for this currency." }, { status: 404 });
    return NextResponse.json({ code, symbol: cur.symbol, perUsd: used.perUsd, date: used.date }, { headers: { "cache-control": "public, max-age=1800, s-maxage=3600" } });
  } catch {
    return NextResponse.json({ error: "Could not load the exchange rate. Try again shortly." }, { status: 502 });
  }
}
