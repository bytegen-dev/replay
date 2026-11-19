import { getJson } from "./http.ts";
import { searchLocalStocks } from "./localStocks.ts";
import type { StockDay, StockMeta } from "./stocks.ts";

/**
 * The backup for stock prices, used when Yahoo Finance refuses. Nasdaq's public quote API needs no key and gives about ten
 * years of daily closes (already adjusted for splits, not for dividends) for US stocks and ETFs. It is a worse source than
 * Yahoo (shorter, no dividend-adjusted series), so it only answers when Yahoo can't, and results from it are labelled.
 */

const HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  accept: "application/json",
  origin: "https://www.nasdaq.com",
  referer: "https://www.nasdaq.com/",
};

interface NasdaqBody {
  data?: { tradesTable?: { rows?: { date?: string; close?: string }[] } | null } | null;
}

const price = (s: unknown): number | null => {
  const n = typeof s === "string" ? Number(s.replace(/[$,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Nasdaq's JSON -> clean trading days, oldest first. Null when there are none. */
export function parseNasdaqHistory(body: unknown, symbol: string): { meta: StockMeta; days: StockDay[] } | null {
  const rows = (body as NasdaqBody | null)?.data?.tradesTable?.rows;
  if (!Array.isArray(rows)) return null;
  const days = new Map<string, StockDay>();
  for (const r of rows) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r?.date ?? "");
    const close = price(r?.close);
    if (!m || close === null) continue;
    const date = `${m[3]}-${m[1]}-${m[2]}`;
    days.set(date, { date, close, adjClose: close });
  }
  const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  return { meta: { symbol, name: symbol, currency: "USD", exchange: null, price: last.close, priceDate: last.date, splits: [], via: "nasdaq" }, days: sorted };
}

/** Ten years of closes from Nasdaq, trying the stock listing then the ETF listing. Null when Nasdaq doesn't know the ticker. */
export async function fetchNasdaqHistory(symbol: string, today: string): Promise<{ meta: StockMeta; days: StockDay[] } | null> {
  const code = encodeURIComponent(symbol.replace(/-/g, "."));
  for (const assetclass of ["stocks", "etf"]) {
    try {
      const body = await getJson<unknown>(`https://api.nasdaq.com/api/quote/${code}/historical?assetclass=${assetclass}&fromdate=1990-01-01&todate=${today}&limit=9999`, HEADERS);
      const parsed = parseNasdaqHistory(body, symbol);
      if (parsed) {
        // Nasdaq's price history carries no company name; the saved ticker list does.
        const known = searchLocalStocks(symbol, 1)[0];
        if (known?.symbol === symbol) parsed.meta.name = known.name;
        return parsed;
      }
    } catch {
      /* try the next listing, then give up quietly: the caller reports Yahoo's error */
    }
  }
  return null;
}
