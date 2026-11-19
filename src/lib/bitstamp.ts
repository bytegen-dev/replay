import { getJson } from "./http.ts";
import { majorFor } from "./majors.ts";
import type { StockDay, StockMeta } from "./stocks.ts";

/**
 * Daily prices for the big coins from Bitstamp's public exchange API: no key, a generous rate limit, and real traded USD
 * prices. For Bitcoin it reaches back to 2011, further than Yahoo's 2014. It is the main source for the coins where its history
 * is as long as Yahoo's (Bitcoin, Ethereum, XRP) and the backup, when Yahoo refuses, for the others it lists (their history on
 * Bitstamp is shorter). BNB is not listed there.
 */

/** Yahoo ticker -> Bitstamp pair. */
export const BITSTAMP_PAIRS: Record<string, string> = {
  "BTC-USD": "btcusd",
  "ETH-USD": "ethusd",
  "XRP-USD": "xrpusd",
  "LTC-USD": "ltcusd",
  "LINK-USD": "linkusd",
  "SOL-USD": "solusd",
  "ADA-USD": "adausd",
  "DOGE-USD": "dogeusd",
  "AVAX-USD": "avaxusd",
};

/** The coins where Bitstamp is asked first, because its history is at least as long as Yahoo's. */
export const BITSTAMP_PRIMARY = new Set(["BTC-USD", "ETH-USD", "XRP-USD"]);

interface Candle {
  timestamp?: string;
  close?: string;
}

/** Bitstamp's daily candles -> clean days, oldest first. Null when there are none. */
export function parseBitstamp(rows: Candle[], symbol: string): { meta: StockMeta; days: StockDay[] } | null {
  const days = new Map<string, StockDay>();
  for (const r of rows) {
    const ts = Number(r?.timestamp);
    const close = Number(r?.close);
    if (!Number.isFinite(ts) || !(close > 0)) continue;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    days.set(date, { date, close, adjClose: close });
  }
  const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  return { meta: { symbol, name: majorFor(symbol)?.name ?? symbol, currency: "USD", exchange: "Bitstamp", price: last.close, priceDate: last.date, splits: [], via: "bitstamp" }, days: sorted };
}

/** The full daily history, fetched newest first in pages of 1,000 days (Bitcoin is six calls). Null for a coin Bitstamp doesn't list. */
export async function fetchBitstampHistory(symbol: string, now: string): Promise<{ meta: StockMeta; days: StockDay[] } | null> {
  const pair = BITSTAMP_PAIRS[symbol];
  if (!pair) return null;
  let end = Math.floor(Date.parse(`${now}T00:00:00Z`) / 1000) + 86_400;
  const rows: Candle[] = [];
  let earliest = Infinity;
  // A page can hold fewer than the limit (999 for 1,000) even when older days exist, so keep going until a page adds nothing.
  for (let page = 0; page < 12; page++) {
    const body = await getJson<{ data?: { ohlc?: Candle[] } }>(`https://www.bitstamp.net/api/v2/ohlc/${pair}/?step=86400&limit=1000&end=${end}`);
    const got = body?.data?.ohlc ?? [];
    if (got.length === 0) break;
    const first = Number(got[0].timestamp);
    if (!(first < earliest)) break;
    rows.push(...got);
    earliest = first;
    end = first - 1;
  }
  return parseBitstamp(rows, symbol);
}
