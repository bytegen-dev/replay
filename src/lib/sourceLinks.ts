import type { SourceLink } from "./types.ts";

/** Where each price source's data can be seen, for sources that have no more specific link in the result. */
const HOME: Record<string, string> = {
  Yahoo: "https://finance.yahoo.com/",
  Nasdaq: "https://www.nasdaq.com/market-activity/quotes/historical",
  Tiingo: "https://www.tiingo.com/",
  Bitstamp: "https://www.bitstamp.net/markets/",
  Hyperliquid: "https://app.hyperliquid.xyz/trade/HYPE",
  CoinGecko: "https://www.coingecko.com/",
  GeckoTerminal: "https://www.geckoterminal.com/",
  DexHunter: "https://app.dexhunter.io/",
};

/**
 * The link for a row's source: the result's own link for that source when it has one (it points at this asset's page), otherwise
 * the source's home page. Null for a price typed by hand or a row with no source.
 */
export function sourceUrl(source: string, sources: SourceLink[]): string | null {
  if (!source || source === "none" || source === "manual") return null;
  const own = sources.find((s) => s.label.toLowerCase().startsWith(source.toLowerCase()) && /^https:\/\//.test(s.url));
  return own?.url ?? HOME[source] ?? null;
}
