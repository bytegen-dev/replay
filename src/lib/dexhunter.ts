import { getJson, HttpError } from "./http.ts";
import { addDays, toDateString } from "./months.ts";
import type { DailyPoint, SourceLink } from "./types.ts";

/**
 * Daily Cardano token prices from DexHunter's chart API, which aggregates Cardano DEXs and keeps history
 * well past CoinGecko's free year. It prices a token in ADA, so each day is converted to USD with
 * Bitstamp's ADA/USD close for the same UTC day. A day with no ADA/USD close is dropped, never guessed.
 */

const CHARTS_URL = "https://charts.dhapi.io/charts";
const BITSTAMP_URL = "https://www.bitstamp.net/api/v2/ohlc/adausd/";
/** Candles asked for per request. Keeps each call small however long the range is. */
const CHUNK_DAYS = 300;
const CACHE_TTL_MS = 60 * 60 * 1000;

/* ------------------------------ pure parts ------------------------------ */

export interface AdaCandle {
  /** UTC day, YYYY-MM-DD */
  date: string;
  /** ADA per token, at the close of the day */
  close: number;
  /** Traded volume. Quoted in ADA, as the price is. */
  volume: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `{ data: [{ close, timestamp, volume }] }` -> clean daily candles. Anything malformed is skipped. */
export function parseCandles(body: unknown): AdaCandle[] {
  const rows = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const out = new Map<string, AdaCandle>();
  for (const r of rows as { close?: unknown; timestamp?: unknown; volume?: unknown }[]) {
    const date = typeof r?.timestamp === "string" ? r.timestamp.slice(0, 10) : "";
    const close = typeof r?.close === "number" ? r.close : NaN;
    if (!DAY.test(date) || !Number.isFinite(close) || close <= 0) continue;
    const volume = typeof r.volume === "number" && Number.isFinite(r.volume) && r.volume >= 0 ? r.volume : 0;
    out.set(date, { date, close, volume });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Bitstamp's `{ data: { ohlc: [{ timestamp, close }] } }` -> ADA/USD close by UTC day. */
export function parseAdaUsd(body: unknown): Map<string, number> {
  const rows = (body as { data?: { ohlc?: unknown } } | null)?.data?.ohlc;
  const out = new Map<string, number>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows as { timestamp?: unknown; close?: unknown }[]) {
    const ts = Number(r?.timestamp);
    const close = Number(r?.close);
    if (Number.isFinite(ts) && Number.isFinite(close) && close > 0) out.set(toDateString(ts * 1000), close);
  }
  return out;
}

/** ADA-priced candles -> USD points. A day with no ADA/USD close is left out rather than estimated. */
export function toUsdPoints(candles: AdaCandle[], adaUsd: Map<string, number>): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (const c of candles) {
    const usd = adaUsd.get(c.date);
    if (!usd) continue;
    out.push({ date: c.date, price: c.close * usd, volume: c.volume * usd, source: "DexHunter" });
  }
  return out;
}

/** Splits [from, to] (YYYY-MM-DD, inclusive) into windows of at most `days` days. */
export function chunkRange(from: string, to: string, days = CHUNK_DAYS): [string, string][] {
  const out: [string, string][] = [];
  let start = from;
  while (start <= to) {
    const end = addDays(start, days - 1);
    out.push([start, end < to ? end : to]);
    start = addDays(end, 1);
  }
  return out;
}

/* ---------------------------- network parts ----------------------------- */

const cache = new Map<string, { at: number; value: AdaCandle[] }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unixStart = (d: string) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000);

/** One DexHunter request. Sends the partner key when DEXHUNTER_PARTNER_ID is set, and retries 429 and 5xx. */
async function fetchCandles(unit: string, from: string, to: string): Promise<AdaCandle[]> {
  const body = JSON.stringify({ tokenIn: "", tokenOut: unit, period: "1day", from: unixStart(from), to: unixStart(addDays(to, 1)) });
  const hit = cache.get(body);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  const key = process.env.DEXHUNTER_PARTNER_ID?.trim();
  if (key) headers["X-Partner-Id"] = key;

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(CHARTS_URL, { method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(25_000) });
      if (res.ok) {
        const value = parseCandles(await res.json());
        cache.set(body, { at: Date.now(), value });
        return value;
      }
      lastStatus = res.status;
      if (res.status !== 429 && res.status < 500) break;
    } catch {
      lastStatus = 0;
    }
    await sleep(1000 * 2 ** attempt);
  }
  throw new HttpError(lastStatus, lastStatus === 401 || lastStatus === 403 ? "DexHunter wants a partner key (set DEXHUNTER_PARTNER_ID)" : "DexHunter request failed");
}

/** ADA/USD closes, one per UTC day from `from`, paging past Bitstamp's 1000-candle limit if needed. */
async function fetchAdaUsd(from: string, to: string): Promise<Map<string, number>> {
  const all = new Map<string, number>();
  let start = unixStart(from);
  const end = unixStart(addDays(to, 1));
  for (let page = 0; page < 5 && start < end; page++) {
    const body = await getJson<unknown>(`${BITSTAMP_URL}?step=86400&limit=1000&start=${start}`);
    const days = parseAdaUsd(body);
    if (!days.size) break;
    for (const [d, v] of days) all.set(d, v);
    const last = [...days.keys()].sort().pop() as string;
    if (days.size < 1000 || last >= to) break;
    start = unixStart(addDays(last, 1));
  }
  return all;
}

export interface DexhunterSeries {
  points: DailyPoint[];
  sources: SourceLink[];
}

/** Daily USD prices for a Cardano token (its full asset id) over [from, to]. Null when DexHunter has no data. */
export async function dexhunterSeries(unit: string, from: string, to: string): Promise<DexhunterSeries | null> {
  const candles: AdaCandle[] = [];
  for (const [a, b] of chunkRange(from, to)) candles.push(...(await fetchCandles(unit, a, b)));
  if (!candles.length) return null;

  const adaUsd = await fetchAdaUsd(from, to);
  const points = toUsdPoints(
    candles.filter((c) => c.date >= from && c.date <= to),
    adaUsd,
  );
  if (!points.length) return null;
  return {
    points,
    sources: [
      { label: "DexHunter daily charts (ADA pairs across Cardano DEXs)", url: "https://dexhunter.gitbook.io/dexhunter-partners/data/charts" },
      { label: "Bitstamp ADA/USD daily close (converts ADA prices to USD)", url: "https://www.bitstamp.net/api/v2/ohlc/adausd/" },
    ],
  };
}
