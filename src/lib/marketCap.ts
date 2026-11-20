import { getJson } from "./http.ts";
import { loadTokenInfo } from "./tokenInfoSource.ts";
import type { Chain, Market } from "./types.ts";

/**
 * Today's market cap for something, so a past price can be turned into a past market cap. Tokens come from CoinGecko and
 * DexScreener (with the circulating supply, when there is one); stocks from Nasdaq's public quote summary.
 */

export interface MarketCapNow {
  /** Market cap today, in USD. */
  usd: number | null;
  /** Coins in circulation today. Tokens only. */
  supply: number | null;
}

const HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  accept: "application/json",
  origin: "https://www.nasdaq.com",
  referer: "https://www.nasdaq.com/",
};

/** "5,030,880,101,180" or "$1.2T" style text -> dollars. Null when it isn't a number. */
export function parseMoney(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^\$?\s*([\d,]+(?:\.\d+)?)\s*([KMBT])?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] ?? "").toUpperCase() as "K" | "M" | "B" | "T"] ?? 1;
  return Number.isFinite(n) && n > 0 ? n * mult : null;
}

/** Nasdaq's quote summary -> market cap. Null when it has none (ETFs, for one). */
export function parseNasdaqMarketCap(body: unknown): number | null {
  const mc = (body as { data?: { summaryData?: { MarketCap?: { value?: unknown } } | null } | null } | null)?.data?.summaryData?.MarketCap;
  return parseMoney(mc?.value);
}

async function stockMarketCap(symbol: string): Promise<MarketCapNow | null> {
  try {
    const body = await getJson<unknown>(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.toLowerCase())}/summary?assetclass=stocks`, HEADERS);
    const usd = parseNasdaqMarketCap(body);
    return usd ? { usd, supply: null } : null;
  } catch {
    return null;
  }
}

export async function marketCapNow(market: Market, address: string): Promise<MarketCapNow | null> {
  if (market === "equity") return stockMarketCap(address);
  const info = await loadTokenInfo(market as Chain, address).catch(() => null);
  if (!info || (!info.marketCap && !info.circulatingSupply)) return null;
  return { usd: info.marketCap ?? null, supply: info.circulatingSupply ?? null };
}

export interface MarketCapAt {
  usd: number;
  basis: "reported" | "estimated";
  /** One plain sentence on where the number comes from. */
  note: string;
  /** Today's market cap, when known, to compare with. */
  todayUsd: number | null;
}

/**
 * The market cap at the moment asked about.
 *  - `reported`: the source gave it for that moment (CoinGecko does, for the coins it lists).
 *  - `estimated`: price then times today's supply, or today's market cap scaled by how the price has moved. It ignores
 *    supply that has been added or burned since, so it is off by that much.
 */
export function marketCapAt(o: { reportedUsd: number | null; priceUsd: number; nowPriceUsd: number | null; now: MarketCapNow | null; sharesAdjustedPriceUsd?: number }): MarketCapAt | null {
  const todayUsd = o.now?.usd ?? null;
  if (o.reportedUsd && o.reportedUsd > 0) return { usd: o.reportedUsd, basis: "reported", note: "The market cap CoinGecko recorded at that moment.", todayUsd };
  if (!o.now) return null;
  if (o.now.supply && o.now.supply > 0) {
    return { usd: o.priceUsd * o.now.supply, basis: "estimated", note: "Estimated: the price then times today's circulating supply. Supply that was added or burned since is not counted.", todayUsd };
  }
  if (o.now.usd && o.nowPriceUsd && o.nowPriceUsd > 0) {
    const then = o.sharesAdjustedPriceUsd ?? o.priceUsd;
    return { usd: o.now.usd * (then / o.nowPriceUsd), basis: "estimated", note: "Estimated: today's market cap scaled by how the price has moved. Shares issued or bought back since are not counted.", todayUsd };
  }
  return null;
}
