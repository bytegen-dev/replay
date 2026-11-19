import { getJson } from "./http.ts";
import { searchLocalStocks } from "./localStocks.ts";
import type { StockDay, StockMeta } from "./stocks.ts";

/**
 * Stock prices from Tiingo, using a key the user pastes into Settings. Tiingo's daily history reaches back decades and has the
 * dividend-adjusted close, so it is as good as Yahoo. Its plain `close` is NOT adjusted for splits, so the split-adjusted close
 * is rebuilt here from the split factors. The key is sent with the request, used once, and never stored on the server.
 */

/** A Tiingo key is a 40-character hex token; this only guards against pasted junk, not against wrong keys. */
export const isTiingoKey = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9]{20,64}$/.test(s);

interface TiingoRow {
  date?: string;
  close?: number;
  adjClose?: number;
  splitFactor?: number;
}

const pos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Tiingo's daily rows -> trading days (oldest first) with the split-adjusted close and the dividend-adjusted close. */
export function parseTiingo(body: unknown, symbol: string): { meta: StockMeta; days: StockDay[] } | null {
  if (!Array.isArray(body)) return null;
  const rows = (body as TiingoRow[]).filter((r) => typeof r?.date === "string" && pos(r.close)).sort((a, b) => a.date!.localeCompare(b.date!));
  if (rows.length === 0) return null;
  // Walk back from today multiplying by each later split, so old prices are shown at today's share count.
  const days: StockDay[] = [];
  const splits: { date: string; ratio: number }[] = [];
  let factor = 1;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const date = r.date!.slice(0, 10);
    days.push({ date, close: r.close! / factor, adjClose: pos(r.adjClose) ? r.adjClose / factor : r.close! / factor });
    if (pos(r.splitFactor) && r.splitFactor !== 1) {
      splits.push({ date, ratio: r.splitFactor });
      factor *= r.splitFactor;
    }
  }
  days.reverse();
  splits.reverse();
  const last = rows[rows.length - 1];
  return { meta: { symbol, name: symbol, currency: "USD", exchange: null, price: last.close!, priceDate: last.date!.slice(0, 10), splits, via: "tiingo" }, days };
}

/** Full daily history from Tiingo. Throws on a refused key or an unknown ticker; the caller decides what to fall back to. */
export async function fetchTiingoHistory(symbol: string, today: string, key: string): Promise<{ meta: StockMeta; days: StockDay[] } | null> {
  const body = await getJson<unknown>(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices?startDate=1970-01-01&endDate=${today}`, {
    authorization: `Token ${key}`,
    "content-type": "application/json",
  });
  const parsed = parseTiingo(body, symbol);
  if (parsed) {
    const known = searchLocalStocks(symbol, 1)[0];
    if (known?.symbol === symbol) parsed.meta.name = known.name;
  }
  return parsed;
}
