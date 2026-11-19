import { NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";
import { getStockHistory } from "@/lib/stocks.ts";

/** The first day a stock or major coin has a price, so the form can stop you picking a month before it existed. */
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const rate = await hitRateLimit(`web-start:${hashSecret(ip).slice(0, 16)}`, 60, 60);
  if (!rate.ok) return NextResponse.json({ firstDate: null }, { status: 429 });

  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) return NextResponse.json({ firstDate: null }, { status: 400 });
  try {
    const { days } = await getStockHistory(symbol);
    return NextResponse.json({ firstDate: days[0]?.date ?? null }, { headers: { "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    // Not knowing the start date is fine: the form just doesn't restrict anything.
    return NextResponse.json({ firstDate: null });
  }
}
