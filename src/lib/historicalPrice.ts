import { DcaError } from "./errors.ts";
import { resolveCardanoUnit } from "./gtCardano.ts";
import { HttpError } from "./http.ts";
import { formatAge, formatUsdPrice, pickCandle, toleranceSec, type Basis, type Candle, type Pick as PricePick } from "./priceAt.ts";
import {
  cardanoCandles,
  cgSnapshots,
  CARDANO_RESOLUTION,
  gtCandles,
  GT_RESOLUTION,
  yahooBars,
  yahooIntervalFor,
  YAHOO_RESOLUTION,
  type CardanoPeriod,
  type GtTimeframe,
  type YahooInterval,
} from "./priceProviders.ts";
import { cgResolve, gtTopPool, type GtPool, type ResolvedToken } from "./providers.ts";
import { getStockHistory, splitFactorAfter, type StockDay, type StockMeta } from "./stocks.ts";
import { MARKET_LABELS, type Chain, type Market } from "./types.ts";
import type { When } from "./when.ts";

/**
 * The price of a token or stock at a moment in the past.
 *
 * It tries the finest data first and steps down: minute candles, then hourly, then daily, taking each only if it
 * has a price near enough to the moment. Each source can only see so far back (GeckoTerminal about six months,
 * CoinGecko's free tier a year, Yahoo's intraday bars two years), and the answer always says which one it used.
 * The price is the close of the last candle that had finished by that moment: the last trade before it.
 */

export interface HistoricalPriceRequest {
  market: Market;
  /** Contract, mint, Cardano policy id, or (stocks) the ticker. */
  address: string;
  when: When;
  /** Cardano only: the full asset id, when the caller has it. */
  unit?: string;
}

export interface HistoricalPriceResult {
  /** One plain sentence with the answer. Safe to quote. */
  answer: string;
  asset: { market: string; symbol: string | null; name: string | null; address: string };
  when: {
    /** The moment priced, in UTC. For a whole day, the moment the day ended. */
    instantUtc: string;
    dateUtc: string;
    timeUtc: string | null;
    precision: "minute" | "day";
    timezone: string;
    description: string;
    assumptions: string[];
  };
  price: {
    usd: number;
    /** How the number was read off the candle. */
    basis: string;
    /** "1-minute", "1-hour", "daily", "hourly snapshot"... */
    resolution: string;
    /** When this price was set (the candle's end), in UTC. */
    asOfUtc: string;
    /** Seconds between that price and the moment asked about. 0 means it was current. */
    ageSeconds: number;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volumeUsd: number | null;
    /** Stocks only: the same price adjusted for later splits, i.e. in today's shares. */
    splitAdjustedUsd?: number;
  };
  /** The price now, and how much it has moved since. Null when it isn't cheaply known. */
  current: { usd: number; changePercent: number } | null;
  source: { label: string; url: string };
  warnings: string[];
}

/* ------------------------------ sources, replaceable for tests ------------------------------ */

export interface PriceProviders {
  gtPool(chain: Chain, address: string): Promise<GtPool | null>;
  gtCandles(pool: GtPool, timeframe: GtTimeframe, instantSec: number): Promise<Candle[]>;
  cgResolve(chain: Chain, address: string): Promise<ResolvedToken | null>;
  cgSnapshots(coinId: string, instantSec: number, nowSec: number): Promise<{ candles: Candle[]; stepSec: number }>;
  cardanoUnit(policy: string, unit: string | undefined, hint: string | null): Promise<string | null>;
  cardanoCandles(unit: string, period: CardanoPeriod, instantSec: number): Promise<Candle[]>;
  equityHistory(symbol: string, nowMs: number): Promise<{ meta: StockMeta; days: StockDay[]; staleSince: number | null }>;
  equityBars(symbol: string, interval: YahooInterval, instantSec: number): Promise<Candle[]>;
}

export const defaultProviders: PriceProviders = {
  gtPool: gtTopPool,
  gtCandles,
  cgResolve: (chain, address) => cgResolve(chain, address),
  cgSnapshots,
  cardanoUnit: resolveCardanoUnit,
  cardanoCandles,
  equityHistory: getStockHistory,
  equityBars: yahooBars,
};

/* ------------------------------ wording ------------------------------ */

/** GeckoTerminal's free API refuses anything older than this, minute, hour or day. */
const GT_REACH_SEC = 175 * 86400;
/** CoinGecko's free tier. A paid plan has no limit. */
const CG_FREE_REACH_SEC = 364 * 86400;
/** Past this a stale price is no answer at all. */
const MAX_STALE_SEC = 30 * 86400;
/** A stock price this old, at most, is "the market was closed" (a long weekend plus a holiday). */
const MARKET_CLOSED_MAX_SEC = 6 * 86400;

const RESOLUTION_LABEL: Record<number, string> = { 60: "1-minute", 300: "5-minute", 3600: "1-hour", 86400: "daily" };
const resolutionLabel = (sec: number) => RESOLUTION_LABEL[sec] ?? (sec >= 3600 ? `${Math.round(sec / 3600)}-hour` : `${Math.round(sec / 60)}-minute`);
const snapshotLabel = (stepSec: number) => (stepSec >= 3000 ? "hourly snapshot" : `${Math.max(1, Math.round(stepSec / 60))}-minute snapshot`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayWords = (dateUtc: string) => {
  const [y, m, d] = dateUtc.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const utcIso = (sec: number) => new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
const clockUtc = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

function basisText(basis: Basis, resLabel: string, staleSec: number, daily: boolean): string {
  if (daily) return "the closing price of that day";
  if (basis === "latest") return "the latest price";
  if (basis === "open-of-candle") return `the open of the ${resLabel} candle in progress at that moment`;
  if (basis === "carried-forward") return `the last known price, set ${formatAge(staleSec)} before that moment`;
  if (resLabel.endsWith("snapshot")) return `the last ${resLabel} before that moment`;
  return `the close of the last ${resLabel} candle before that moment`;
}

export function describeHistorical(o: {
  name: string;
  usd: number;
  when: Pick<When, "isNow" | "precision" | "dateUtc" | "description">;
  resolution: string;
  staleSec: number;
  tolerance: number;
  current: number | null;
  marketClosed?: boolean;
  asOfSec?: number;
  /** A stock that didn't trade on the day asked about: the day of the close that is shown instead (YYYY-MM-DD). */
  closedDay?: string;
}): string {
  const price = formatUsdPrice(o.usd);
  let s: string;
  if (o.marketClosed && o.closedDay) {
    s = `${o.name} didn't trade on ${dayWords(o.when.dateUtc)} because the market was closed. Its last close before then was ${price}, on ${dayWords(o.closedDay)}.`;
    if (o.current !== null && o.usd > 0) s += changeSince(o.usd, o.current);
    return s;
  }
  if (o.when.isNow) s = `${o.name} is ${price} right now.`;
  else if (o.when.precision === "day") s = `${o.name} closed at ${price} on ${dayWords(o.when.dateUtc)}.`;
  else s = `${o.name} was ${price} at ${o.when.description}${o.resolution === "1-minute" ? "" : ` (${o.resolution} price)`}.`;

  if (o.marketClosed && o.asOfSec !== undefined) s += ` The market was closed then; that is the last price, set at ${clockUtc(o.asOfSec)}.`;
  else if (o.staleSec > o.tolerance && o.asOfSec !== undefined) s += ` Nothing traded for a while; that is the last price, set ${formatAge(o.staleSec)} earlier.`;

  if (o.current !== null && !o.when.isNow && o.usd > 0) s += changeSince(o.usd, o.current);
  return s;
}

/** " Now it is $X, 12.3% higher." or " That is about the same as now ($X)." */
function changeSince(then: number, now: number): string {
  const change = (now / then - 1) * 100;
  const size = Math.abs(change) >= 100 ? `${Math.round(Math.abs(change)).toLocaleString("en-US")}%` : `${Math.abs(change).toFixed(1)}%`;
  return Math.abs(change) < 0.05 ? ` That is about the same as now (${formatUsdPrice(now)}).` : ` Now it is ${formatUsdPrice(now)}, ${size} ${change > 0 ? "higher" : "lower"}.`;
}

/* ------------------------------ the ladder ------------------------------ */

interface Candidate {
  pick: PricePick | null;
  /** Length of one candle in seconds (for point snapshots, the gap between them). */
  res: number;
  label: string;
  sourceLabel: string;
  sourceUrl: string;
  /** Source-specific adjustments, filled in by the stock path. */
  extra?: { splitAdjusted?: number; actual?: number };
}

class Attempts {
  reasons: string[] = [];
  rateLimited = false;
  stalest: Candidate | null = null;

  /** Runs one step. A failure is recorded as a reason and the ladder moves on. */
  async run(source: string, step: () => Promise<Candidate | null>): Promise<Candidate | null> {
    try {
      return await step();
    } catch (e) {
      if (e instanceof HttpError && e.status === 429) {
        this.rateLimited = true;
        this.reasons.push(`${source} is rate limiting right now`);
      } else if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
        this.reasons.push(`${source} does not reach back that far on its free tier`);
      } else if (e instanceof HttpError && e.status === 404) {
        this.reasons.push(`${source} has no data for this`);
      } else {
        this.reasons.push(`${source} could not be reached`);
      }
      return null;
    }
  }

  /** Accepts a candidate if its price is recent enough for its resolution; otherwise remembers the closest one. */
  take(c: Candidate | null, latest: boolean): Candidate | null {
    if (!c?.pick) return null;
    if (latest || c.pick.staleSec <= toleranceSec(c.res)) return c;
    if (!this.stalest || c.pick.staleSec < (this.stalest.pick?.staleSec ?? Infinity)) this.stalest = c;
    return null;
  }
}

interface Resolved {
  chosen: Candidate;
  symbol: string | null;
  name: string | null;
  current: number | null;
  warnings: string[];
  marketClosed?: boolean;
  /** Stocks: the trading day whose close is shown when the day asked about was a market holiday or weekend. */
  closedDay?: string;
}

const notFound = (a: Attempts, what: string, when: When) =>
  new DcaError(
    a.rateLimited ? 429 : 404,
    a.rateLimited
      ? "A price provider is rate limiting right now. Wait a minute and try again."
      : `No price found for ${what} at ${when.description}.${a.reasons.length ? ` ${[...new Set(a.reasons)].join("; ")}.` : " It may not have traded then."}`.replace(/\.\./g, "."),
  );

/** CoinGecko snapshots around the moment, used when pools can't see back that far. */
async function coingeckoStep(a: Attempts, p: PriceProviders, coinId: string, instantSec: number, nowSec: number, latest: boolean): Promise<Candidate | null> {
  return a.run("CoinGecko", async () => {
    const { candles, stepSec } = await p.cgSnapshots(coinId, instantSec, nowSec);
    return { pick: pickCandle(candles, instantSec, 0, latest), res: stepSec, label: snapshotLabel(stepSec), sourceLabel: "CoinGecko market data", sourceUrl: `https://www.coingecko.com/en/coins/${coinId}` };
  });
}

/* ------------------------------ tokens ------------------------------ */

async function resolveToken(req: HistoricalPriceRequest, ctx: Ctx, p: PriceProviders): Promise<Resolved> {
  const chain = req.market as Chain;
  const a = new Attempts();
  const warnings: string[] = [];
  let symbol: string | null = null;
  let name: string | null = null;
  let current: number | null = null;
  let found: Candidate | null = null;

  const pool = await p.gtPool(chain, req.address).catch((e) => {
    if (e instanceof HttpError && e.status === 429) a.rateLimited = true;
    a.reasons.push("GeckoTerminal could not be reached");
    return null;
  });
  if (pool) {
    symbol = pool.symbol;
    name = pool.name;
    current = pool.price;
    if (ctx.ageSec <= GT_REACH_SEC) {
      const frames: GtTimeframe[] = ctx.fine ? ["minute", "hour", "day"] : ["day"];
      for (const tf of frames) {
        found = a.take(
          await a.run("GeckoTerminal", async () => {
            const res = GT_RESOLUTION[tf];
            const pick = pickCandle(await p.gtCandles(pool, tf, ctx.instantSec), ctx.instantSec, res, ctx.latest);
            return { pick, res, label: resolutionLabel(res), sourceLabel: `GeckoTerminal pool candles (${tf})`, sourceUrl: `https://www.geckoterminal.com/${pool.network}/pools/${pool.pool}` };
          }),
          ctx.latest,
        );
        // Once a source says "slow down", asking it again for a coarser candle only makes it worse and slower.
        if (found || a.rateLimited) break;
      }
    } else {
      a.reasons.push("GeckoTerminal only keeps about six months of prices");
    }
  }

  if (!found && (ctx.ageSec <= CG_FREE_REACH_SEC || ctx.cgHasFullHistory)) {
    const cg = await a.run("CoinGecko", async () => {
      const t = await p.cgResolve(chain, req.address);
      return t ? ({ pick: null, res: 0, label: "", sourceLabel: "", sourceUrl: "", token: t } as Candidate & { token: ResolvedToken }) : null;
    });
    const token = (cg as (Candidate & { token?: ResolvedToken }) | null)?.token;
    if (token) {
      symbol ??= token.symbol?.replace(/^\$/, "").toUpperCase() ?? null;
      name ??= token.name;
      current ??= token.price;
      if (token.id) found = a.take(await coingeckoStep(a, p, token.id, ctx.instantSec, ctx.nowSec, ctx.latest), ctx.latest);
    }
  } else if (!found) {
    a.reasons.push("CoinGecko's free tier reaches back one year (a paid plan reaches further)");
  }

  found ??= a.stalest && (a.stalest.pick?.staleSec ?? Infinity) <= MAX_STALE_SEC ? a.stalest : null;
  if (!found?.pick) throw notFound(a, symbol ?? name ?? shortAddress(req.address), ctx.when);

  if (ctx.fine && found.res > 60) {
    warnings.push(
      ctx.ageSec > GT_REACH_SEC
        ? `Minute-level prices only exist for about the last six months, so this is the ${found.label} price.`
        : `No minute-level trades were found near that time, so this is the ${found.label} price.`,
    );
  }
  return { chosen: found, symbol, name, current, warnings };
}

/* ------------------------------ Cardano ------------------------------ */

async function resolveCardano(req: HistoricalPriceRequest, ctx: Ctx, p: PriceProviders): Promise<Resolved> {
  const a = new Attempts();
  const warnings: string[] = [];
  let found: Candidate | null = null;

  const cgToken = await a.run("CoinGecko", async () => {
    const t = await p.cgResolve("cardano", req.address);
    return t ? ({ pick: null, res: 0, label: "", sourceLabel: "", sourceUrl: "", token: t } as Candidate & { token: ResolvedToken }) : null;
  });
  const token = (cgToken as (Candidate & { token?: ResolvedToken }) | null)?.token ?? null;
  const symbol = token?.symbol?.replace(/^\$/, "").toUpperCase() ?? null;
  const name = token?.name ?? null;

  const unit = await p.cardanoUnit(req.address, req.unit, symbol ?? name).catch(() => null);
  if (unit) {
    const periods: CardanoPeriod[] = ctx.fine ? ["1min", "1hour", "1day"] : ["1day"];
    for (const period of periods) {
      found = a.take(
        await a.run("DexHunter", async () => {
          const res = CARDANO_RESOLUTION[period];
          const pick = pickCandle(await p.cardanoCandles(unit, period, ctx.instantSec), ctx.instantSec, res, ctx.latest);
          return { pick, res, label: resolutionLabel(res), sourceLabel: "DexHunter Cardano DEX charts, converted to USD with Bitstamp ADA/USD", sourceUrl: "https://dexhunter.gitbook.io/dexhunter-partners/data/charts" };
        }),
        ctx.latest,
      );
      if (found || a.rateLimited) break;
    }
  } else {
    a.reasons.push("The token's full asset id could not be found");
  }

  if (!found && token?.id && (ctx.ageSec <= CG_FREE_REACH_SEC || ctx.cgHasFullHistory)) {
    found = a.take(await coingeckoStep(a, p, token.id, ctx.instantSec, ctx.nowSec, ctx.latest), ctx.latest);
  }
  found ??= a.stalest && (a.stalest.pick?.staleSec ?? Infinity) <= MAX_STALE_SEC ? a.stalest : null;
  if (!found?.pick) throw notFound(a, symbol ?? name ?? shortAddress(req.address), ctx.when);

  if (ctx.fine && found.res > 60) warnings.push(`Minute-level prices weren't available near that time, so this is the ${found.label} price.`);
  if (found.sourceLabel.startsWith("DexHunter")) warnings.push("DexHunter fills quiet periods with the last traded price, and Cardano pools are thin, so treat the price as approximate.");
  return { chosen: found, symbol, name, current: token?.price ?? null, warnings };
}

/* ------------------------------ stocks ------------------------------ */

const dateSec = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

async function resolveEquity(req: HistoricalPriceRequest, ctx: Ctx, p: PriceProviders): Promise<Resolved> {
  const symbol = req.address.trim().toUpperCase();
  const a = new Attempts();
  const warnings: string[] = [];

  let hist: Awaited<ReturnType<PriceProviders["equityHistory"]>>;
  try {
    hist = await p.equityHistory(symbol, ctx.nowMs);
  } catch (e) {
    if (e instanceof DcaError) throw e;
    if (e instanceof HttpError && e.status === 404) throw new DcaError(404, `No stock found for "${symbol}". Check the ticker.`);
    if (e instanceof HttpError && e.status === 429) throw new DcaError(429, "Yahoo Finance is rate limiting requests. Wait a minute and retry.");
    throw new DcaError(502, "Could not reach Yahoo Finance for prices. Try again shortly.");
  }
  const { meta, days } = hist;
  if (meta.currency && meta.currency !== "USD") throw new DcaError(422, `${symbol} is priced in ${meta.currency}. Only USD-quoted stocks and ETFs are supported.`);
  if (hist.staleSince !== null) warnings.push(`Yahoo Finance is not answering right now, so daily prices come from a copy saved on ${new Date(hist.staleSince).toISOString().slice(0, 10)}.`);

  const adjusted = new Map(days.map((d) => [d.date, d.close]));
  const dailyCandles: Candle[] = days.map((d) => ({ t: dateSec(d.date), open: Number.NaN, high: Number.NaN, low: Number.NaN, close: d.close }));
  let chosen: Candidate | null = null;
  let marketClosed = false;
  let closedDay: string | undefined;

  // Intraday bars first, when a time was asked for (or the present).
  const interval = ctx.latest ? "1m" : ctx.fine ? yahooIntervalFor(ctx.ageSec) : null;
  if (interval) {
    const res = YAHOO_RESOLUTION[interval];
    const c = await a.run("Yahoo Finance", async () => {
      const bars = await p.equityBars(symbol, interval, ctx.instantSec);
      const pick = pickCandle(bars, ctx.instantSec, res, ctx.latest);
      return { pick, res, label: resolutionLabel(res), sourceLabel: "Yahoo Finance intraday prices", sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/` } as Candidate;
    });
    // For a stock, "no trades lately" mostly means the market was closed, which is not worth a coarser source.
    if (c?.pick && (ctx.latest || c.pick.staleSec <= MARKET_CLOSED_MAX_SEC)) {
      chosen = c;
      marketClosed = !ctx.latest && c.pick.staleSec > toleranceSec(res);
    }
  }

  if (!chosen && ctx.latest && meta.price) {
    // No fresh bar: the saved latest price will do, with its date.
    chosen = { pick: { priceUsd: meta.price, candle: { t: dateSec(meta.priceDate ?? days[days.length - 1]?.date ?? "1970-01-01"), open: meta.price, high: meta.price, low: meta.price, close: meta.price }, resolutionSec: 86400, basis: "latest", staleSec: 0 }, res: 86400, label: "latest", sourceLabel: "Yahoo Finance", sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/` };
    warnings.push(`Live prices were unavailable, so this is the latest saved price${meta.priceDate ? ` (${meta.priceDate})` : ""}.`);
  }

  if (!chosen) {
    // Daily closes: for a whole day, and for any time older than Yahoo's intraday bars.
    const endSec = ctx.fine ? dateSec(new Date(ctx.instantSec * 1000).toISOString().slice(0, 10)) + 86400 : ctx.instantSec;
    const pick = pickCandle(dailyCandles, endSec, 86400, false);
    if (pick) {
      chosen = { pick, res: 86400, label: "daily", sourceLabel: "Yahoo Finance daily history", sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/` };
      if (ctx.fine && !ctx.latest) warnings.push(interval === null ? "Intraday prices only go back about two years, so this is the closing price of that day." : "No intraday prices were found for that time, so this is the closing price of that day.");
      const lastTradingDay = new Date((pick.candle.t) * 1000).toISOString().slice(0, 10);
      const wanted = new Date((endSec - 1) * 1000).toISOString().slice(0, 10);
      if (lastTradingDay !== wanted && pick.staleSec <= MARKET_CLOSED_MAX_SEC) {
        marketClosed = true;
        closedDay = lastTradingDay;
        warnings.push(`The market was closed on ${dayWords(wanted)}, so this is the close of ${dayWords(lastTradingDay)}.`);
      }
    }
  }
  if (!chosen?.pick) {
    const first = days[0]?.date;
    throw new DcaError(404, `No price found for ${symbol} at ${ctx.when.description}.${first ? ` Its price history starts on ${dayWords(first)}.` : ""}`);
  }

  // Yahoo's prices are adjusted for later splits. Report what the stock actually traded at, and keep the adjusted figure.
  const pick = chosen.pick;
  const candleDate = new Date(pick.candle.t * 1000).toISOString().slice(0, 10);
  const factor = splitFactorAfter(meta.splits, candleDate);
  if (factor !== 1 && !(ctx.latest)) {
    // Intraday bars may already be as-traded. Compare with the day's adjusted close to find out.
    const daily = adjusted.get(candleDate);
    const alreadyAsTraded = chosen.res < 86400 && daily !== undefined && Math.abs(pick.priceUsd / (daily * factor) - 1) < 0.1 && Math.abs(pick.priceUsd / daily - 1) >= 0.1;
    if (!alreadyAsTraded) {
      chosen.extra = { splitAdjusted: pick.priceUsd, actual: pick.priceUsd * factor };
      const ratios = (meta.splits ?? []).filter((s) => s.date > candleDate).map((s) => `${s.ratio}-for-1 on ${dayWords(s.date)}`).join(", ");
      warnings.push(`${symbol} has split since (${ratios}). $${(pick.priceUsd * factor).toFixed(2)} is what it traded at then; in today's shares that is ${formatUsdPrice(pick.priceUsd)}.`);
    }
  }
  return { chosen, symbol, name: meta.name, current: meta.price, warnings, marketClosed, closedDay };
}

/* ------------------------------ entry point ------------------------------ */

interface Ctx {
  when: When;
  nowMs: number;
  nowSec: number;
  instantSec: number;
  ageSec: number;
  /** A time of day, or a moment that isn't a UTC midnight, was asked for: try minute and hour candles. */
  fine: boolean;
  /** The present: take the newest price. */
  latest: boolean;
  cgHasFullHistory: boolean;
}

const shortAddress = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export async function historicalPrice(req: HistoricalPriceRequest, nowMs: number = Date.now(), providers: PriceProviders = defaultProviders): Promise<HistoricalPriceResult> {
  const instantSec = Math.floor(req.when.instantMs / 1000);
  const nowSec = Math.floor(nowMs / 1000);
  const ctx: Ctx = {
    when: req.when,
    nowMs,
    nowSec,
    instantSec,
    ageSec: Math.max(0, nowSec - instantSec),
    fine: req.when.precision === "minute" || req.when.instantMs % 86_400_000 !== 0,
    latest: req.when.isNow,
    cgHasFullHistory: (process.env.COINGECKO_PLAN ?? "").toLowerCase() === "pro" && !!process.env.COINGECKO_API_KEY,
  };

  const r = req.market === "equity" ? await resolveEquity(req, ctx, providers) : req.market === "cardano" ? await resolveCardano(req, ctx, providers) : await resolveToken(req, ctx, providers);
  const { chosen } = r;
  const pick = chosen.pick as PricePick;
  const c = pick.candle;
  // A snapshot is one price, not a candle: showing it as open, high, low and close would be four copies of the same number.
  const isSnapshot = chosen.label.endsWith("snapshot");
  const finiteOrNull = (x: number) => (Number.isFinite(x) && !isSnapshot ? x : null);
  const endSec = c.t + (pick.resolutionSec > 0 ? pick.resolutionSec : 0);
  const reported = chosen.extra?.actual ?? pick.priceUsd;
  const scale = reported / pick.priceUsd;
  const daily = req.when.precision === "day" && chosen.res >= 86400;
  const label = r.symbol ?? r.name ?? shortAddress(req.address);
  const warnings = [...r.warnings];
  if (pick.staleSec > toleranceSec(chosen.res) && !r.marketClosed && !ctx.latest && req.market !== "equity") {
    warnings.push(`Nothing traded near that time. The price shown was set ${formatAge(pick.staleSec)} earlier.`);
  }

  return {
    answer: describeHistorical({
      name: label,
      usd: reported,
      when: req.when,
      resolution: chosen.label,
      staleSec: pick.staleSec,
      tolerance: toleranceSec(chosen.res),
      current: r.current,
      marketClosed: r.marketClosed,
      asOfSec: endSec,
      closedDay: r.closedDay,
    }),
    asset: { market: req.market === "equity" ? "stock" : req.market, symbol: r.symbol, name: r.name, address: req.market === "equity" ? req.address.toUpperCase() : req.address },
    when: {
      instantUtc: utcIso(instantSec),
      dateUtc: req.when.dateUtc,
      timeUtc: req.when.timeUtc,
      precision: req.when.precision,
      timezone: req.when.timezone,
      description: req.when.description,
      assumptions: req.when.assumptions,
    },
    price: {
      usd: reported,
      basis: basisText(pick.basis, chosen.label, pick.staleSec, daily),
      resolution: chosen.label,
      asOfUtc: utcIso(endSec),
      ageSeconds: Math.round(pick.staleSec),
      open: finiteOrNull(c.open * scale),
      high: finiteOrNull(c.high * scale),
      low: finiteOrNull(c.low * scale),
      close: finiteOrNull(c.close * scale),
      volumeUsd: c.volume !== undefined ? c.volume : null,
      ...(chosen.extra?.splitAdjusted !== undefined ? { splitAdjustedUsd: chosen.extra.splitAdjusted } : {}),
    },
    current: r.current !== null && r.current > 0 && reported > 0 ? { usd: r.current, changePercent: Math.round((r.current / reported - 1) * 10000) / 100 } : null,
    source: { label: chosen.sourceLabel, url: chosen.sourceUrl },
    warnings,
  };
}

export { MARKET_LABELS };
