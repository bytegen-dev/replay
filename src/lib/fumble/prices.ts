import { fetchRetry, makeLimiter, NetError, type Fetch, type Sleep } from "./net.ts";
import { priceAt } from "./fumble.ts";
import type { Candle } from "./types.ts";

/**
 * Price history for a token, in dollars, from Birdeye first and GeckoTerminal as the fallback.
 *
 * Both are free-tier APIs with tight limits (Birdeye about 1 request a second, GeckoTerminal about 30 a minute), so each has its
 * own limiter, and a token costs one call (two for GeckoTerminal, which has to find the pool first). The candle size is chosen
 * so one call covers the whole stretch from the sale to now: the highest price is kept whatever the candle size, so coarser
 * candles only make the sale's own candle bigger, and that candle is left out of the fumble anyway.
 */

/** One call can return about 1000 candles; 950 leaves room for the edges. */
const MAX_CANDLES = 950;

export interface PriceSeries {
  candles: Candle[];
  /** Which provider answered. */
  source: string;
}

/** A way to get a token's candles from `fromTime` to `nowTime` (seconds). Null means "no price history for this token". Throws when the provider itself failed. */
export type CandleProvider = (mint: string, fromTime: number, nowTime: number) => Promise<Candle[] | null>;

/* ------------------------------ Birdeye ------------------------------ */

const BIRDEYE_STEPS: { type: string; seconds: number }[] = [
  { type: "1m", seconds: 60 },
  { type: "5m", seconds: 300 },
  { type: "15m", seconds: 900 },
  { type: "1H", seconds: 3600 },
  { type: "4H", seconds: 14400 },
  { type: "12H", seconds: 43200 },
  { type: "1D", seconds: 86400 },
];

/** The finest candle size that covers `span` seconds in one call. The daily candle is the last resort, however long the span. */
export function birdeyeStep(span: number) {
  return BIRDEYE_STEPS.find((s) => span / s.seconds <= MAX_CANDLES) ?? BIRDEYE_STEPS[BIRDEYE_STEPS.length - 1];
}

interface BirdeyeItem {
  unixTime?: number;
  h?: number;
  l?: number;
  c?: number;
  vUsd?: number;
}

export function parseBirdeye(json: unknown): Candle[] | null {
  const body = json as { success?: boolean; data?: { items?: BirdeyeItem[] } } | null;
  if (!body || body.success === false) return null;
  const items = body.data?.items;
  if (!Array.isArray(items)) return null;
  const out: Candle[] = [];
  for (const i of items) {
    if (typeof i.unixTime !== "number" || !(i.h! > 0) || !(i.c! > 0)) continue;
    out.push({ t: i.unixTime, h: i.h!, l: i.l ?? i.h!, c: i.c!, v: i.vUsd });
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface ProviderDeps {
  fetchImpl?: Fetch;
  sleep?: Sleep;
  now?: () => number;
}

export function birdeyeProvider(apiKey: string, deps: ProviderDeps = {}, minGapMs = 1100): CandleProvider {
  const fetchImpl: Fetch = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const limited = makeLimiter(minGapMs, deps.sleep, deps.now);
  return (mint, fromTime, nowTime) =>
    limited(async () => {
      const step = birdeyeStep(nowTime - fromTime);
      const url = `https://public-api.birdeye.so/defi/ohlcv?address=${encodeURIComponent(mint)}&type=${step.type}&time_from=${Math.floor(fromTime - step.seconds)}&time_to=${Math.floor(nowTime)}`;
      const res = await fetchRetry(fetchImpl, url, { headers: { "X-API-KEY": apiKey, "x-chain": "solana", accept: "application/json" } }, { sleep: deps.sleep });
      if (res.status === 404) return null;
      if (!res.ok) throw new NetError(res.status, "public-api.birdeye.so");
      const candles = parseBirdeye(await res.json());
      return candles && candles.length ? candles : null;
    });
}

/* --------------------------- GeckoTerminal --------------------------- */

const GT_STEPS: { path: string; aggregate: number; seconds: number }[] = [
  { path: "minute", aggregate: 1, seconds: 60 },
  { path: "minute", aggregate: 5, seconds: 300 },
  { path: "minute", aggregate: 15, seconds: 900 },
  { path: "hour", aggregate: 1, seconds: 3600 },
  { path: "hour", aggregate: 4, seconds: 14400 },
  { path: "hour", aggregate: 12, seconds: 43200 },
  { path: "day", aggregate: 1, seconds: 86400 },
];

export function gtStep(span: number) {
  return GT_STEPS.find((s) => span / s.seconds <= MAX_CANDLES) ?? GT_STEPS[GT_STEPS.length - 1];
}

interface GtPoolRow {
  attributes?: { address?: string; volume_usd?: { h24?: string } };
  relationships?: { base_token?: { data?: { id?: string } } };
}

/** The pool with the most trading in the last day, and whether the token is the pool's base or quote asset (the price call must say which). */
export function pickPool(json: unknown, mint: string): { address: string; side: "base" | "quote" } | null {
  const rows = (json as { data?: GtPoolRow[] } | null)?.data;
  if (!Array.isArray(rows)) return null;
  let best: { address: string; side: "base" | "quote"; vol: number } | null = null;
  for (const r of rows) {
    const address = r.attributes?.address;
    if (!address) continue;
    const vol = Number(r.attributes?.volume_usd?.h24) || 0;
    if (best && vol <= best.vol) continue;
    const base = r.relationships?.base_token?.data?.id?.replace(/^solana_/, "");
    best = { address, side: base === mint ? "base" : "quote", vol };
  }
  return best ? { address: best.address, side: best.side } : null;
}

export function parseGtCandles(json: unknown): Candle[] | null {
  const list = (json as { data?: { attributes?: { ohlcv_list?: number[][] } } } | null)?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return null;
  const out: Candle[] = [];
  for (const [t, , h, l, c, v] of list) if (t > 0 && h > 0 && c > 0) out.push({ t, h, l, c, v });
  return out.sort((a, b) => a.t - b.t);
}

export function geckoProvider(deps: ProviderDeps = {}, minGapMs = 2200): CandleProvider {
  const fetchImpl: Fetch = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const limited = makeLimiter(minGapMs, deps.sleep, deps.now);
  const get = async (path: string) => {
    const res = await fetchRetry(fetchImpl, `https://api.geckoterminal.com/api/v2${path}`, { headers: { accept: "application/json" } }, { sleep: deps.sleep });
    if (res.status === 404) return null;
    if (!res.ok) throw new NetError(res.status, "api.geckoterminal.com");
    return res.json() as Promise<unknown>;
  };
  return async (mint, fromTime, nowTime) => {
    const pool = pickPool(await limited(() => get(`/networks/solana/tokens/${encodeURIComponent(mint)}/pools`)), mint);
    if (!pool) return null;
    const step = gtStep(nowTime - fromTime);
    const json = await limited(() => get(`/networks/solana/pools/${pool.address}/ohlcv/${step.path}?aggregate=${step.aggregate}&limit=1000&currency=usd&token=${pool.side}&before_timestamp=${Math.floor(nowTime + step.seconds)}`));
    const candles = parseGtCandles(json);
    return candles && candles.length ? candles : null;
  };
}

/* ------------------------------ putting them together ------------------------------ */

/** Tries each provider in turn: the first to return candles wins. A provider that fails or has nothing for the token is skipped. Null when none had it. */
export function firstOf(providers: { name: string; get: CandleProvider }[]) {
  return async (mint: string, fromTime: number, nowTime: number): Promise<PriceSeries | null> => {
    for (const p of providers) {
      try {
        const candles = await p.get(mint, fromTime, nowTime);
        if (candles && candles.length) return { candles, source: p.name };
      } catch {
        /* this provider is down or limited: try the next */
      }
    }
    return null;
  };
}

/** The wrapped SOL address: the "token" whose dollar price is the SOL price. */
export const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * The SOL price in USD at a moment. One call covers an hour of minute candles, so every sale in the same hour shares it.
 * Null when no provider had the SOL price (the sale then cannot be valued).
 */
export function solPriceAt(prices: (mint: string, from: number, now: number) => Promise<PriceSeries | null>) {
  const byHour = new Map<number, Promise<Candle[] | null>>();
  return async (time: number): Promise<number | null> => {
    const hour = Math.floor(time / 3600) * 3600;
    if (!byHour.has(hour)) byHour.set(hour, prices(SOL_MINT, hour, hour + 3600).then((s) => s?.candles ?? null));
    const candles = await byHour.get(hour)!;
    // A failed lookup is not remembered, so a hiccup does not poison that hour for everyone after.
    if (!candles) byHour.delete(hour);
    return candles ? priceAt(candles, time) : null;
  };
}
