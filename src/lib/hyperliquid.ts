import { majorFor } from "./majors.ts";
import type { StockDay, StockMeta } from "./stocks.ts";

/**
 * Daily prices for coins that trade on Hyperliquid (HYPE), from its public info API: no key, real USD prices. It is the only
 * feed with HYPE's own history, which starts on 2024-12-05, so it is asked first, as Bitstamp is for Bitcoin.
 */

/** Yahoo-style ticker -> Hyperliquid coin name. */
export const HYPERLIQUID_COINS: Record<string, string> = {
  "HYPE-USD": "HYPE",
};

interface Candle {
  /** Candle open time, ms since the epoch. */
  t?: number;
  /** Close, as text. */
  c?: string;
}

/** Hyperliquid's daily candles -> clean days, oldest first. Null when there are none. */
export function parseHyperliquid(rows: Candle[], symbol: string): { meta: StockMeta; days: StockDay[] } | null {
  const days = new Map<string, StockDay>();
  for (const r of rows) {
    const t = Number(r?.t);
    const close = Number(r?.c);
    if (!Number.isFinite(t) || !(close > 0)) continue;
    const date = new Date(t).toISOString().slice(0, 10);
    days.set(date, { date, close, adjClose: close });
  }
  const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  return { meta: { symbol, name: majorFor(symbol)?.name ?? symbol, currency: "USD", exchange: "Hyperliquid", price: last.close, priceDate: last.date, splits: [], via: "hyperliquid" }, days: sorted };
}

/** The full daily history in one call (the API returns up to 5,000 days). Null for a coin Hyperliquid doesn't list. */
export async function fetchHyperliquidHistory(symbol: string, now: string): Promise<{ meta: StockMeta; days: StockDay[] } | null> {
  const coin = HYPERLIQUID_COINS[symbol];
  if (!coin) return null;
  const end = Date.parse(`${now}T00:00:00Z`) + 86_400_000;
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: "1d", startTime: Date.parse("2023-01-01T00:00:00Z"), endTime: end } }),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Candle[] | null;
  return parseHyperliquid(Array.isArray(rows) ? rows : [], symbol);
}
