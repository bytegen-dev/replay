import list from "../data/stocks.json" with { type: "json" };
import { COMMODITIES } from "./commodities.ts";
import { POPULAR_STOCKS } from "./popularStocks.ts";
import type { StockHit } from "./stocks.ts";

/** The saved list of US-listed stocks and ETFs (see scripts/update-stocks.mjs): [symbol, name, exchange, isEtf]. */
const ALL = list as unknown as [string, string, string, 0 | 1][];
const POPULAR = new Map(POPULAR_STOCKS.map((s, i) => [s.symbol, i]));

/**
 * Searches the saved list by ticker or company name. Exact ticker first, then tickers that start with the text, then names
 * that start with it or have a word that does, then names that contain it. Well-known stocks win ties.
 */
export function searchLocalStocks(query: string, limit = 10): StockHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { hit: [string, string, string, 0 | 1 | 2]; score: number }[] = [];
  // Commodities first: a word like "gold" or "oil" should find the commodity before any company that has it in its name.
  for (const c of COMMODITIES) {
    const sym = c.symbol.toLowerCase();
    const name = c.name.toLowerCase();
    let score = 99;
    if (sym === q || sym.replace("=f", "") === q) score = 0;
    else if (name === q) score = -0.5;
    else if (name.startsWith(q)) score = 0.5;
    else if (name.split(/[\s,.&()-]+/).some((w) => w.startsWith(q))) score = 0.8;
    else if (c.also?.some((w) => w.startsWith(q))) score = 0.9;
    else if (c.group.toLowerCase().startsWith(q) || "commodity".startsWith(q) || "futures".startsWith(q)) score = 1.2;
    if (score < 99) scored.push({ hit: [c.symbol, c.name, "Futures", 2], score });
  }
  for (const row of ALL) {
    const sym = row[0].toLowerCase();
    const name = row[1].toLowerCase();
    let score = 99;
    if (sym === q) score = 0;
    else if (sym.startsWith(q)) score = 1 + sym.length / 100;
    else if (name.startsWith(q)) score = 2;
    else if (name.split(/[\s,.&-]+/).some((w) => w.startsWith(q))) score = 3;
    else if (q.length >= 3 && name.includes(q)) score = 4;
    if (score < 99) scored.push({ hit: row, score: score - (POPULAR.has(row[0]) ? 0.5 : 0) });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.hit[0].localeCompare(b.hit[0]))
    .slice(0, limit)
    .map(({ hit }) => ({ symbol: hit[0], name: hit[1], exchange: hit[2], type: hit[3] === 2 ? "COMMODITY" : hit[3] ? "ETF" : "EQUITY" }));
}

export const localStockCount = ALL.length;
