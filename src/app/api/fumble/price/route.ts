import { NextResponse } from "next/server";
import { isWalletAddress } from "@/lib/fumble/helius.ts";
import { getCoinPricer } from "@/lib/fumble/live.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/** Pricing one coin looks up one price history and the SOL price beside it, so it is quick, but it still calls the free price APIs. */
export const maxDuration = 30;

/**
 * Price one coin of a scanned wallet again (the "Price" button on a row that could not be priced).
 *
 *   POST { "wallet": "<address>", "token": "<coin address>" }
 *
 * Answers 200 with that coin's sells and closed positions, now priced if a price history could be found, and its share of the total fumble (see
 * ApiCoinPricing); the page puts them in place of the old ones. It works from the trades saved by the wallet's last scan, so nothing is read from the chain:
 * 409 says nothing is saved here for the wallet (scan it again), 400 a bad address, 429 too many tries, 503 not set up.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { wallet?: unknown; token?: unknown } | null;
  const wallet = typeof body?.wallet === "string" ? body.wallet.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  // A coin's address has the same shape as a wallet's.
  if (!isWalletAddress(wallet) || !isWalletAddress(token)) return NextResponse.json({ error: "That doesn't look like a Solana address." }, { status: 400 });
  const pricer = getCoinPricer();
  if (!pricer) return NextResponse.json({ error: "The fumble scanner isn't set up yet." }, { status: 503 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const perPerson = await hitRateLimit(`fumble-price:${hashSecret(ip).slice(0, 16)}`, 40, 600);
  if (!perPerson.ok) return NextResponse.json({ error: "You've tried a lot of prices. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(perPerson.resetSeconds) } });
  const everyone = await hitRateLimit("fumble-price:all", 600, 3600);
  if (!everyone.ok) return NextResponse.json({ error: "Lots of people are pricing right now. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(everyone.resetSeconds) } });

  try {
    const priced = await pricer(wallet, token);
    if (!priced) return NextResponse.json({ error: "Nothing is saved here to price this coin from. Scan the wallet again." }, { status: 409, headers: { "cache-control": "no-store" } });
    return NextResponse.json(priced, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("fumble price failed:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "Couldn't price this coin. Try again shortly." }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
