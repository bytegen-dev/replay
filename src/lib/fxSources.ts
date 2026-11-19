import { currencyByCode } from "./fxCurrencies.ts";
import { mergeHistory, parseFredCsv, parseFrankfurter, parseImf, type FxPoint } from "./fx.ts";

/**
 * Fetches exchange-rate history for one currency (units per US dollar). Network and caching only; the reading and lookup
 * maths is in fx.ts. Each currency is a chain of sources (see fxCurrencies.ts), then recent months are topped up from a
 * daily feed. A series is kept in memory for twelve hours, and an old copy is served if a source is down.
 */

export interface FxSeries {
  code: string;
  points: FxPoint[];
  /** Where the history came from, for the "Sources" line. */
  sources: { label: string; url: string }[];
}

const TTL_MS = 12 * 60 * 60 * 1000;
const memory = new Map<string, { at: number; series: FxSeries }>();
const inflight = new Map<string, Promise<FxSeries>>();

const FRED = (id: string) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
const ECB = (code: string) => `https://api.frankfurter.dev/v1/1999-01-04..?base=USD&symbols=${code}`;
const IMF = (iso: string) => `https://api.db.nomics.world/v22/series/IMF/IFS/M.${iso}.ENDA_XDC_USD_RATE?observations=1`;
/** A free daily feed of rates against the dollar, one file per day, from 2 March 2024. */
const DAILY = (date: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`;
const DAILY_FIRST = "2024-03-02";

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000), headers: { accept: "application/json,text/csv,*/*" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
}

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

/** Month-end dates after `after`, up to and including today, no earlier than the daily feed begins. */
function recentDates(after: string, today: string): string[] {
  const out: string[] = [];
  let [y, m] = after.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < 40; i++) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const d = lastDayOfMonth(y, m);
    if (d >= today) break;
    if (d > after && d >= DAILY_FIRST) out.push(d);
  }
  return out;
}

async function dailyRate(code: string, date: string): Promise<FxPoint | null> {
  try {
    const j = (await (await get(DAILY(date))).json()) as { usd?: Record<string, number> };
    const v = j.usd?.[code.toLowerCase()];
    return typeof v === "number" && v > 0 ? { date, perUsd: v } : null;
  } catch {
    return null;
  }
}

async function build(code: string, now: number): Promise<FxSeries> {
  const cur = currencyByCode(code);
  if (!cur) throw new Error(`Unknown currency ${code}`);
  const sources: FxSeries["sources"] = [];
  let points: FxPoint[] = [];

  if (cur.fred) {
    try {
      points = parseFredCsv(await (await get(FRED(cur.fred.id))).text(), cur.fred.quote);
      sources.push({ label: "US Federal Reserve (FRED)", url: `https://fred.stlouisfed.org/series/${cur.fred.id}` });
    } catch {
      /* fall through to the next source */
    }
  }
  if (points.length === 0 && cur.ecb) {
    try {
      points = parseFrankfurter(await (await get(ECB(cur.code))).json(), cur.code);
      sources.push({ label: "European Central Bank (Frankfurter)", url: "https://frankfurter.dev" });
    } catch {
      /* fall through */
    }
  }
  if (cur.imf) {
    try {
      const imf = parseImf(await (await get(IMF(cur.imf))).json());
      if (imf.length) {
        points = mergeHistory(points, imf);
        sources.push({ label: "IMF International Financial Statistics (DBnomics)", url: `https://db.nomics.world/IMF/IFS/M.${cur.imf}.ENDA_XDC_USD_RATE` });
      }
    } catch {
      /* the other sources may already be enough */
    }
  }
  if (points.length === 0) throw new Error(`No exchange-rate history is available for ${code} right now.`);

  // Top up the months since the last observation from the daily feed (only matters when the main source ends early).
  const today = new Date(now).toISOString().slice(0, 10);
  const last = points[points.length - 1].date;
  const dates = recentDates(last, today);
  if (dates.length > 0) {
    const extra = (await Promise.all([...dates, today].map((d) => dailyRate(cur.code, d)))).filter((p): p is FxPoint => p !== null);
    if (extra.length) {
      points = mergeHistory(points, extra);
      sources.push({ label: "Daily exchange-rate feed (fawazahmed0/currency-api)", url: "https://github.com/fawazahmed0/exchange-api" });
    }
  }
  return { code: cur.code, points, sources };
}

/** The rate history for a currency, from memory or the sources. USD is a flat 1. */
export async function getFxSeries(code: string, now: number = Date.now()): Promise<FxSeries> {
  const c = code.trim().toUpperCase();
  if (c === "USD") return { code: "USD", points: [{ date: "1900-01-01", perUsd: 1, monthly: true }], sources: [] };
  const hit = memory.get(c);
  if (hit && now - hit.at < TTL_MS) return hit.series;
  const pending = inflight.get(c);
  if (pending) return pending;
  const run = build(c, now)
    .then((series) => {
      memory.set(c, { at: now, series });
      return series;
    })
    .catch((e) => {
      if (hit) return hit.series;
      throw e;
    })
    .finally(() => inflight.delete(c));
  inflight.set(c, run);
  return run;
}

/** Test hook. */
export function clearFxMemory(): void {
  memory.clear();
}
