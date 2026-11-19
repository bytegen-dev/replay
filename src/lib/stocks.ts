import { majorFor } from "./majors.ts";
import { DcaError } from "./errors.ts";
import { getJson, HttpError } from "./http.ts";
import { addDays, monthsBetween, targetDate, todayUtc } from "./months.ts";
import { selectAllMonths } from "./select.ts";
import { fetchNasdaqHistory } from "./nasdaqHistory.ts";
import { fetchTiingoHistory } from "./tiingo.ts";
import { readHistory, writeHistory } from "./stockStore.ts";
import type { DailyPoint, DcaRequest, DcaResponse } from "./types.ts";

/**
 * Ordinary listed stocks and ETFs, priced from Yahoo Finance's daily chart data, which goes back decades.
 * Yahoo's `close` is already adjusted for stock splits (Apple's 2013 close shows as $19.61, not $549), and
 * `adjclose` also folds in dividends. The default is splits only; "reinvest dividends" uses `adjclose` for
 * every day, which gives the total return of buying each month and reinvesting each payout.
 * Yahoo's endpoint is unofficial, so every failure is handled and reported, never guessed around.
 */

/* ------------------------------ pure parts ------------------------------ */

export interface StockDay {
  date: string;
  close: number;
  adjClose: number;
}

export interface StockMeta {
  symbol: string;
  name: string;
  currency: string;
  exchange: string | null;
  /** Latest price, and the trading day it belongs to. */
  price: number | null;
  priceDate: string | null;
  /** Stock splits, oldest first. `ratio` is new shares per old share (7 for a 7-for-1 split). */
  splits?: { date: string; ratio: number }[];
  /** Set when the history came from the backup source instead of Yahoo. */
  via?: "nasdaq" | "tiingo";
}

interface YahooChart {
  chart?: {
    result?: {
      meta?: Record<string, unknown>;
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[]; adjclose?: { adjclose?: (number | null)[] }[] };
    }[] | null;
  };
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Exchange-local calendar day of a UTC timestamp (seconds), using the exchange's offset from UTC. */
export function localDay(ts: number, gmtOffsetSeconds: number): string {
  return new Date((ts + gmtOffsetSeconds) * 1000).toISOString().slice(0, 10);
}

/** Splits from a chart's `events.splits`, oldest first. */
export function parseSplits(events: unknown, gmtOffsetSeconds = 0): { date: string; ratio: number }[] {
  const raw = (events as { splits?: Record<string, { date?: number; numerator?: number; denominator?: number }> } | null)?.splits;
  if (!raw || typeof raw !== "object") return [];
  const out: { date: string; ratio: number }[] = [];
  for (const [key, s] of Object.entries(raw)) {
    const ts = typeof s?.date === "number" ? s.date : Number(key);
    const ratio = typeof s?.numerator === "number" && typeof s?.denominator === "number" && s.denominator > 0 ? s.numerator / s.denominator : NaN;
    if (Number.isFinite(ts) && Number.isFinite(ratio) && ratio > 0) out.push({ date: localDay(ts, gmtOffsetSeconds), ratio });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Multiply a split-adjusted price from `date` by this to get what the stock actually traded at that day: every split
 * that happened after `date` shrank the adjusted price. A split on `date` itself has already happened by the close.
 */
export function splitFactorAfter(splits: { date: string; ratio: number }[] | undefined, date: string): number {
  let factor = 1;
  for (const s of splits ?? []) if (s.date > date) factor *= s.ratio;
  return factor;
}

/** Yahoo chart JSON -> meta and clean trading days (oldest first). Null when there is no usable result. */
export function parseYahooChart(body: unknown): { meta: StockMeta; days: StockDay[] } | null {
  const r = (body as YahooChart | null)?.chart?.result?.[0];
  if (!r?.meta || !Array.isArray(r.timestamp)) return null;
  const m = r.meta;
  const offset = num(m.gmtoffset) ?? 0;
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const adjs = r.indicators?.adjclose?.[0]?.adjclose ?? [];

  const days = new Map<string, StockDay>();
  r.timestamp.forEach((ts, i) => {
    const close = num(closes[i]);
    if (typeof ts !== "number" || close === null || close <= 0) return;
    const adj = num(adjs[i]);
    const date = localDay(ts, offset);
    days.set(date, { date, close, adjClose: adj !== null && adj > 0 ? adj : close });
  });

  const price = num(m.regularMarketPrice);
  const priceTime = num(m.regularMarketTime);
  return {
    meta: {
      symbol: typeof m.symbol === "string" ? m.symbol : "",
      name: (typeof m.longName === "string" && m.longName) || (typeof m.shortName === "string" && m.shortName) || (typeof m.symbol === "string" ? m.symbol : ""),
      currency: typeof m.currency === "string" ? m.currency : "",
      exchange: typeof m.fullExchangeName === "string" ? m.fullExchangeName : typeof m.exchangeName === "string" ? m.exchangeName : null,
      price: price !== null && price > 0 ? price : null,
      priceDate: priceTime !== null ? localDay(priceTime, offset) : null,
      splits: parseSplits((r as { events?: unknown }).events, offset),
    },
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Trading days -> price points. `reinvest` uses the dividend-adjusted close, otherwise the split-adjusted close. */
export function stockPoints(days: StockDay[], reinvest: boolean, source: "Yahoo" | "Nasdaq" | "Tiingo" = "Yahoo"): DailyPoint[] {
  return days.map((d) => ({ date: d.date, price: reinvest ? d.adjClose : d.close, source }));
}

export interface StockHit {
  symbol: string;
  name: string;
  exchange: string;
  type: "EQUITY" | "ETF";
}

const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/;

/** Yahoo search JSON -> stocks and ETFs only (no futures, currencies, crypto or indexes). */
export function parseStockSearch(body: unknown): StockHit[] {
  const quotes = (body as { quotes?: unknown } | null)?.quotes;
  if (!Array.isArray(quotes)) return [];
  const out: StockHit[] = [];
  for (const q of quotes as Record<string, unknown>[]) {
    const type = q?.quoteType;
    const symbol = q?.symbol;
    if ((type !== "EQUITY" && type !== "ETF") || typeof symbol !== "string" || !SYMBOL_RE.test(symbol)) continue;
    const name = String(q.longname ?? q.shortname ?? symbol).replace(/\s+/g, " ").trim().slice(0, 80);
    out.push({ symbol: symbol.toUpperCase(), name, exchange: String(q.exchDisp ?? q.exchange ?? "").slice(0, 30), type });
  }
  return out.slice(0, 10);
}

/* ---------------------------- network parts ----------------------------- */

/**
 * Where to ask. YAHOO_BASE_URL (comma-separated) overrides the defaults: point it at a proxy if Yahoo blocks your
 * server's address, or at a local stand-in when testing.
 */
const BASES = (process.env.YAHOO_BASE_URL ?? "").split(",").map((b) => b.trim().replace(/\/$/, "")).filter(Boolean);
const HOSTS = BASES.length ? BASES : ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
/** Yahoo refuses requests that don't look like a browser. */
export const YAHOO_HEADERS = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };

const unixStart = (d: string) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000);

/** One Yahoo request, trying the second host when the first fails. A 404 (unknown ticker) is final. */
export async function yahoo<T>(path: string): Promise<T> {
  let last: unknown;
  for (const host of HOSTS) {
    try {
      return await getJson<T>(`${host}${path}`, YAHOO_HEADERS);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw e;
      last = e;
    }
  }
  throw last;
}

export function fetchStockChart(symbol: string, from: string, to: string): Promise<unknown> {
  // `to` is rounded to a whole day so repeat requests in one day share the cache.
  return yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${unixStart(from)}&period2=${unixStart(addDays(to, 1))}&interval=1d&events=div%7Csplit&includeAdjustedClose=true`);
}

export function searchStocks(q: string): Promise<unknown> {
  return yahoo(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`);
}

/** The whole stock run: fetch, check it is a USD listing, pick each month's trading day, and total up. */
export interface StockDeps {
  /** Replaces the Yahoo chart request, for tests. */
  fetchChart?: (symbol: string, from: string, to: string) => Promise<unknown>;
  /** Replaces the backup source, for tests. Without it, the backup is only used alongside the real Yahoo request. */
  fetchBackup?: (symbol: string, today: string) => Promise<{ meta: StockMeta; days: StockDay[] } | null>;
  /** A Tiingo key the user supplied; tried after Yahoo and before the Nasdaq backup. Never stored. */
  tiingoKey?: string;
  /** Set false to skip the database copy, for tests. */
  useStore?: boolean;
}

interface Loaded {
  meta: StockMeta;
  days: StockDay[];
  /** Set when Yahoo refused and an older saved copy answered instead. */
  staleSince: number | null;
}

/** Fresh copies last this long before Yahoo is asked again. */
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
/** A copy that came from the backup is replaced sooner, so Yahoo gets asked again once it is answering. */
const BACKUP_TTL_MS = 30 * 60 * 1000;
const ttlFor = (meta: StockMeta) => (meta.via ? BACKUP_TTL_MS : HISTORY_TTL_MS);
const memory = new Map<string, { at: number; meta: StockMeta; days: StockDay[] }>();

/**
 * Full price history for a ticker. Served from memory or the saved copy while it is fresh; otherwise from Yahoo
 * (and saved). If Yahoo refuses and any older copy exists, that is returned and marked stale rather than failing.
 */
async function loadStockHistory(symbol: string, now: number, fetchChart: NonNullable<StockDeps["fetchChart"]>, useStore: boolean, fetchBackup?: StockDeps["fetchBackup"]): Promise<Loaded> {
  const mem = memory.get(symbol);
  if (mem && now - mem.at < ttlFor(mem.meta)) return { meta: mem.meta, days: mem.days, staleSince: null };

  const stored = useStore ? await readHistory(symbol) : null;
  if (stored && now - stored.fetchedAt < ttlFor(stored.meta)) {
    memory.set(symbol, { at: stored.fetchedAt, meta: stored.meta, days: stored.days });
    return { meta: stored.meta, days: stored.days, staleSince: null };
  }

  try {
    const parsed = parseYahooChart(await fetchChart(symbol, "1970-01-01", todayUtc(now)));
    if (!parsed || !parsed.days.length) throw new DcaError(404, `No price history found for "${symbol}". Check the ticker.`);
    memory.set(symbol, { at: now, meta: parsed.meta, days: parsed.days });
    if (useStore) await writeHistory(symbol, parsed.meta, parsed.days);
    return { meta: parsed.meta, days: parsed.days, staleSince: null };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw e;
    if (e instanceof DcaError) throw e;
    const old = stored ?? (mem ? { fetchedAt: mem.at, meta: mem.meta, days: mem.days } : null);
    // An older full Yahoo copy beats the shorter backup; a backup copy is just replaced by a fresh backup.
    if (old && !old.meta.via) return { meta: old.meta, days: old.days, staleSince: old.fetchedAt };
    if (fetchBackup) {
      const backup = await fetchBackup(symbol, todayUtc(now)).catch(() => null);
      if (backup && backup.days.length) {
        memory.set(symbol, { at: now, meta: backup.meta, days: backup.days });
        if (useStore) await writeHistory(symbol, backup.meta, backup.days).catch(() => undefined);
        return { meta: backup.meta, days: backup.days, staleSince: null };
      }
    }
    if (old) return { meta: old.meta, days: old.days, staleSince: old.fetchedAt };
    throw e;
  }
}

/** A ticker's saved daily history (split-adjusted), fetched from Yahoo at most every few hours. */
export async function getStockHistory(symbol: string, now: number = Date.now()): Promise<Loaded> {
  return loadStockHistory(symbol, now, fetchStockChart, true, fetchNasdaqHistory);
}

/** Test hook: forget everything cached in memory. */
export function clearStockMemory(): void {
  memory.clear();
}

export async function runStockDca(req: DcaRequest & { chain: "equity" }, now: number = Date.now(), deps: StockDeps = {}): Promise<DcaResponse> {
  const today = todayUtc(now);
  const symbol = req.address.trim().toUpperCase();
  const months = monthsBetween(req.startMonth, req.endMonth);
  const firstTarget = targetDate(months[0], req.basis, req.basisDay);
  const major = majorFor(symbol);
  const reinvest = req.reinvest === true && !major;

  let loaded: Loaded;
  // After Yahoo: the user's own Tiingo key if they gave one, then Nasdaq. A key that fails is reported, not hidden.
  let keyNote: string | null = null;
  const backup: StockDeps["fetchBackup"] | undefined =
    deps.fetchBackup ??
    (deps.fetchChart
      ? undefined
      : async (sym, today) => {
          if (deps.tiingoKey) {
            try {
              const t = await fetchTiingoHistory(sym, today, deps.tiingoKey);
              if (t) return t;
              keyNote = `Tiingo has no data for ${sym}.`;
            } catch (e) {
              keyNote = e instanceof HttpError && (e.status === 401 || e.status === 403) ? "Your Tiingo key was refused. Check it in Settings." : "Tiingo could not be reached with your key.";
            }
          }
          return fetchNasdaqHistory(sym, today);
        });
  try {
    loaded = await loadStockHistory(symbol, now, deps.fetchChart ?? fetchStockChart, deps.useStore ?? true, backup);
  } catch (e) {
    if (e instanceof DcaError) throw e;
    if (e instanceof HttpError && e.status === 404) throw new DcaError(404, `No stock found for "${symbol}". Check the ticker.`);
    if (e instanceof HttpError && e.status === 429) throw new DcaError(429, "Yahoo Finance is rate limiting requests and there is no saved copy for this ticker yet. Wait a few minutes and retry.");
    throw new DcaError(502, "Could not reach Yahoo Finance for prices. Try again shortly.");
  }
  const { meta, days } = loaded;
  if (meta.currency && meta.currency !== "USD") {
    throw new DcaError(422, `${symbol} is priced in ${meta.currency}. Only USD-quoted stocks and ETFs are supported.`);
  }

  const rows = selectAllMonths(req.startMonth, req.endMonth, stockPoints(days, reinvest, meta.via === "nasdaq" ? "Nasdaq" : meta.via === "tiingo" ? "Tiingo" : "Yahoo"), {
    basis: req.basis,
    basisDay: req.basisDay,
    source: meta.via === "nasdaq" ? "Nasdaq" : meta.via === "tiingo" ? "Tiingo" : "Yahoo",
    today,
    earliestAllowed: null,
    tradingDays: true,
  });

  const warnings: string[] = [];
  if (loaded.staleSince !== null) {
    warnings.push(`Yahoo Finance is not answering right now, so these prices come from a copy saved on ${new Date(loaded.staleSince).toISOString().slice(0, 10)}. Recent months and today's price may be out of date.`);
  }
  const viaBackup = meta.via === "nasdaq";
  if (keyNote && meta.via !== "tiingo") warnings.push(keyNote);
  if (meta.via === "tiingo") warnings.push("Yahoo Finance is not answering right now, so these prices come from Tiingo using your key.");
  if (viaBackup) {
    warnings.push(`Yahoo Finance is not answering right now, so these prices come from Nasdaq's public data, which covers about the last ten years and is adjusted for splits only. ${reinvest ? "Dividend reinvestment is not available from this source, so dividends are ignored. " : ""}Try again later for the full history.`);
  }
  if (!major && !viaBackup) warnings.push(
    reinvest
      ? "Dividends are treated as reinvested: prices are adjusted for dividends and splits, so they sit below the actual historical prices."
      : "Prices are adjusted for stock splits only. Dividends are not included; turn on dividend reinvestment for total return.",
  );
  if (days[0].date > addDays(firstTarget, TRADING_WINDOW_GRACE_DAYS)) {
    warnings.push(`${symbol} has no price history before ${days[0].date}. Earlier months show n/a and are left out of the totals.`);
  }
  const missing = rows.filter((r) => r.price === null && !r.notes.some((n) => n.code === "future")).length;
  if (missing) warnings.push(`${missing} of ${rows.length} months have no price and are excluded from totals.`);

  const last = days[days.length - 1];
  return {
    token: { id: symbol, symbol: major?.ticker ?? symbol, name: major?.name ?? meta.name },
    chain: "equity",
    address: symbol,
    basis: req.basis,
    ...(req.basisDay ? { basisDay: req.basisDay } : {}),
    currentPrice: meta.price ?? last.close,
    currentPriceDate: meta.priceDate ?? last.date,
    reinvest: reinvest && !viaBackup,
    rows,
    sources: viaBackup
      ? [{ label: "Nasdaq historical prices (daily)", url: `https://www.nasdaq.com/market-activity/stocks/${encodeURIComponent(symbol.toLowerCase())}/historical` }]
      : meta.via === "tiingo"
        ? [{ label: "Tiingo end-of-day prices (your key)", url: `https://www.tiingo.com/${encodeURIComponent(symbol.toLowerCase())}` }]
        : [{ label: "Yahoo Finance price history (daily)", url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/` }],
    warnings,
  };
}

/** A first trading day this close to the first target still counts as covering it. */
const TRADING_WINDOW_GRACE_DAYS = 6;
