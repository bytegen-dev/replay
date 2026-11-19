import { postCharts } from "./dexhunter.ts";
import { getJson } from "./http.ts";
import type { Candle } from "./priceAt.ts";
import { coingeckoConfig, type GtPool } from "./providers.ts";
import { yahoo } from "./stocks.ts";

/**
 * Where intraday and old prices come from, one small function per source. Each fetcher returns plain candles;
 * each has a parser that can be tested without the network. The ladder that decides which source to try, and
 * how far back each one can see, lives in historicalPrice.ts.
 */

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/* --------------------------- GeckoTerminal pools --------------------------- */

export type GtTimeframe = "minute" | "hour" | "day";
export const GT_RESOLUTION: Record<GtTimeframe, number> = { minute: 60, hour: 3600, day: 86400 };
/** How many candles to ask for: enough to see back past the longest acceptable gap for that resolution. */
const GT_COUNT: Record<GtTimeframe, number> = { minute: 30, hour: 12, day: 10 };
const GT = "https://api.geckoterminal.com/api/v2";

/** GeckoTerminal's `[time, open, high, low, close, volume]` rows -> candles. Candles exist only for periods with trades. */
export function parseGtOhlcv(body: unknown): Candle[] {
  const list = (body as { data?: { attributes?: { ohlcv_list?: unknown } } } | null)?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [];
  const out: Candle[] = [];
  for (const row of list as unknown[]) {
    if (!Array.isArray(row)) continue;
    const [t, open, high, low, close, volume] = row.map(num);
    if (t === null || open === null || high === null || low === null || close === null || close <= 0) continue;
    out.push({ t, open, high, low, close, ...(volume !== null && volume >= 0 ? { volume } : {}) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Candles from a pool ending just after `instantSec`. Throws HttpError (401 means the free API no longer reaches that far back). */
export async function gtCandles(pool: GtPool, timeframe: GtTimeframe, instantSec: number): Promise<Candle[]> {
  const res = GT_RESOLUTION[timeframe];
  const body = await getJson<unknown>(`${GT}/networks/${pool.network}/pools/${pool.pool}/ohlcv/${timeframe}?aggregate=1&before_timestamp=${instantSec + res}&limit=${GT_COUNT[timeframe]}&currency=usd`);
  return parseGtOhlcv(body);
}

/* --------------------------- CoinGecko snapshots --------------------------- */

/** CoinGecko's `prices: [[ms, usd]]` -> point-in-time prices, plus how far apart they are. */
export function parseCgPoints(body: unknown): { candles: Candle[]; stepSec: number } {
  const prices = (body as { prices?: unknown } | null)?.prices;
  const candles: Candle[] = [];
  if (Array.isArray(prices)) {
    for (const p of prices as unknown[]) {
      if (!Array.isArray(p)) continue;
      const ms = num(p[0]);
      const usd = num(p[1]);
      if (ms !== null && usd !== null && usd > 0) candles.push({ t: Math.floor(ms / 1000), open: usd, high: usd, low: usd, close: usd });
    }
  }
  candles.sort((a, b) => a.t - b.t);
  const gaps = candles.slice(1).map((c, i) => c.t - candles[i].t).filter((g) => g > 0);
  return { candles, stepSec: gaps.length ? median(gaps) : 3600 };
}

/**
 * Prices from CoinGecko in a window around the moment. Within a year (the free tier's reach) this is hourly or finer.
 * Throws HttpError when the moment is out of reach for the plan.
 */
export async function cgSnapshots(coinId: string, instantSec: number, nowSec: number): Promise<{ candles: Candle[]; stepSec: number }> {
  const cfg = coingeckoConfig();
  const from = instantSec - 6 * 3600;
  const to = Math.max(Math.min(instantSec + 3600, nowSec), from + 3600);
  return parseCgPoints(await getJson<unknown>(`${cfg.base}/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`, cfg.headers));
}

/* --------------------------- Cardano: DexHunter + Bitstamp --------------------------- */

export type CardanoPeriod = "1min" | "1hour" | "1day";
export const CARDANO_RESOLUTION: Record<CardanoPeriod, number> = { "1min": 60, "1hour": 3600, "1day": 86400 };
/** How far before the moment to ask, so a quiet stretch is still covered. */
const CARDANO_LOOKBACK: Record<CardanoPeriod, number> = { "1min": 30 * 60, "1hour": 6 * 3600, "1day": 5 * 86400 };
const BITSTAMP = "https://www.bitstamp.net/api/v2/ohlc/adausd/";

/** DexHunter's `{ data: [{ open, high, low, close, unix, volume }] }`, priced in ADA, -> candles. */
export function parseAdaCandles(body: unknown): Candle[] {
  const rows = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const out: Candle[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const t = num(r?.unix);
    const open = num(r?.open);
    const high = num(r?.high);
    const low = num(r?.low);
    const close = num(r?.close);
    if (t === null || open === null || high === null || low === null || close === null || close <= 0) continue;
    const volume = num(r.volume);
    out.push({ t, open, high, low, close, ...(volume !== null && volume >= 0 ? { volume } : {}) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Bitstamp's `{ data: { ohlc: [{ timestamp, close }] } }` -> ADA/USD by candle start (seconds). */
export function parseBitstampRates(body: unknown): Map<number, number> {
  const rows = (body as { data?: { ohlc?: unknown } } | null)?.data?.ohlc;
  const out = new Map<number, number>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows as { timestamp?: unknown; close?: unknown }[]) {
    const t = Number(r?.timestamp);
    const close = Number(r?.close);
    if (Number.isFinite(t) && Number.isFinite(close) && close > 0) out.set(t, close);
  }
  return out;
}

/** ADA-priced candles -> USD, using the ADA/USD rate for the same period (or the latest earlier one, up to 6 periods back). A candle with no rate is dropped, never guessed. */
export function adaToUsd(candles: Candle[], rates: Map<number, number>, stepSec: number): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const bucket = Math.floor(c.t / stepSec) * stepSec;
    let rate: number | undefined;
    for (let k = 0; k <= 6 && rate === undefined; k++) rate = rates.get(bucket - k * stepSec);
    if (!rate) continue;
    out.push({ t: c.t, open: c.open * rate, high: c.high * rate, low: c.low * rate, close: c.close * rate, ...(c.volume !== undefined ? { volume: c.volume * rate } : {}) });
  }
  return out;
}

/** USD candles for a Cardano token (full asset id) around the moment, at the given period. */
export async function cardanoCandles(unit: string, period: CardanoPeriod, instantSec: number): Promise<Candle[]> {
  const step = CARDANO_RESOLUTION[period];
  const from = instantSec - CARDANO_LOOKBACK[period];
  const to = instantSec + step;
  const ada = parseAdaCandles(await postCharts({ tokenIn: "", tokenOut: unit, period, from, to }));
  if (!ada.length) return [];
  const start = Math.floor(from / step) * step - 6 * step;
  const limit = Math.min(1000, Math.ceil((to - start) / step) + 2);
  const rates = parseBitstampRates(await getJson<unknown>(`${BITSTAMP}?step=${step}&limit=${limit}&start=${start}`));
  return adaToUsd(ada, rates, step);
}

/* --------------------------- Stocks: Yahoo intraday bars --------------------------- */

export type YahooInterval = "1m" | "5m" | "1h";
export const YAHOO_RESOLUTION: Record<YahooInterval, number> = { "1m": 60, "5m": 300, "1h": 3600 };

/**
 * The finest intraday bars Yahoo still keeps for a moment this old: 1-minute for about a week, 5-minute for about two
 * months, hourly for about two years. Null beyond that (use the daily close).
 */
export function yahooIntervalFor(ageSec: number): YahooInterval | null {
  const days = ageSec / 86400;
  if (days <= 6.5) return "1m";
  if (days <= 58) return "5m";
  if (days <= 725) return "1h";
  return null;
}

interface YahooBarsChart {
  chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }[] } }[] | null };
}

/** Yahoo intraday JSON -> candles (regular trading hours). Bars with no price are skipped. */
export function parseYahooBars(body: unknown): Candle[] {
  const r = (body as YahooBarsChart | null)?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !Array.isArray(r.timestamp) || !q) return [];
  const out: Candle[] = [];
  r.timestamp.forEach((t, i) => {
    const close = num(q.close?.[i]);
    if (typeof t !== "number" || close === null || close <= 0) return;
    out.push({ t, open: num(q.open?.[i]) ?? close, high: num(q.high?.[i]) ?? close, low: num(q.low?.[i]) ?? close, close });
  });
  return out.sort((a, b) => a.t - b.t);
}

/** Intraday bars for a stock ending just after the moment. */
export async function yahooBars(symbol: string, interval: YahooInterval, instantSec: number): Promise<Candle[]> {
  const from = instantSec - 5 * 86400;
  const to = instantSec + 3600;
  return parseYahooBars(await yahoo<unknown>(`/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=${interval}&includePrePost=false`));
}
