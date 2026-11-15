/** Pure helpers for xStocks (Backed Finance tokenized stocks on Solana). Safe to import in the browser. */

export interface XStock {
  /** CoinGecko id, e.g. tesla-xstock */
  id: string;
  /** On-chain ticker, e.g. TSLAx */
  symbol: string;
  /** Display name without the suffix, e.g. Tesla */
  name: string;
  /** Solana mint address */
  mint: string;
}

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
}

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** "Tesla xStock" -> "Tesla". Names that don't carry the suffix are kept as they are. */
export function stockName(name: string): string {
  return name.replace(/\s+xStocks?$/i, "").trim() || name;
}

/** "tslax" -> "TSLAx": the issuer writes the ticker in capitals with a lowercase x. */
export function stockSymbol(symbol: string): string {
  const s = symbol.replace(/^\$/, "");
  return s.length > 1 && s.toLowerCase().endsWith("x") ? `${s.slice(0, -1).toUpperCase()}x` : s.toUpperCase();
}

/**
 * Joins CoinGecko's xStocks category with its platform addresses. Coins with no valid
 * Solana mint are dropped, never guessed. Sorted by name; duplicates by mint are removed.
 */
export function joinXStocks(markets: MarketCoin[], platforms: Record<string, string | undefined>): XStock[] {
  const seen = new Set<string>();
  const out: XStock[] = [];
  for (const c of markets) {
    const mint = platforms[c.id]?.trim();
    if (!mint || !SOLANA_ADDRESS.test(mint) || seen.has(mint)) continue;
    seen.add(mint);
    out.push({ id: c.id, symbol: stockSymbol(c.symbol), name: stockName(c.name), mint });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Case-insensitive search over name and ticker. Matches that start the name or ticker rank first,
 * so "tes" finds Tesla before anything that merely contains it. An empty query returns everything.
 * The trailing "x" is optional: "tsla" finds TSLAx.
 */
export function searchXStocks(list: XStock[], query: string): XStock[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const scored: { s: XStock; rank: number }[] = [];
  for (const s of list) {
    const name = s.name.toLowerCase();
    const ticker = s.symbol.toLowerCase();
    const bare = ticker.endsWith("x") ? ticker.slice(0, -1) : ticker;
    let rank = -1;
    if (ticker === q || bare === q) rank = 0;
    else if (bare.startsWith(q) || name.startsWith(q)) rank = 1;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) rank = 2;
    else if (name.includes(q) || ticker.includes(q)) rank = 3;
    if (rank >= 0) scored.push({ s, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name)).map((x) => x.s);
}
