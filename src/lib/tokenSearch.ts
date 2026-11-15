import { httpsUrl } from "./tokenInfo.ts";
import type { Chain } from "./types.ts";
import { validateAddress } from "./validate.ts";

/** Pure parsing for the name search. Safe to import in the browser. */

export interface TokenHit {
  chain: Chain;
  /** What the form needs: contract, mint, or Cardano asset id. */
  address: string;
  name: string;
  symbol: string;
  logo: string | null;
  priceUsd: number | null;
  /** DexScreener's own estimate, null when it gives none. Can be wrong, especially for new tokens. */
  marketCap: number | null;
  /** Summed over the token's pools in the results. */
  liquidityUsd: number;
  volume24h: number;
}

export interface DexSearchPair {
  chainId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | number;
  marketCap?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  info?: { imageUrl?: string };
}

/** Pools smaller than this are dust or abandoned launches. Hidden from search, still usable by pasting the address. */
export const MIN_LIQUIDITY_USD = 500;
export const MAX_HITS = 30;

// DexScreener chain ids in its search results. Search covers Cardano even though its per-token endpoint doesn't.
const CHAIN_BY_DEX = new Map<string, Chain>([
  ["ethereum", "ethereum"],
  ["base", "base"],
  ["bsc", "bsc"],
  ["arbitrum", "arbitrum"],
  ["solana", "solana"],
  ["cardano", "cardano"],
]);

/** Whether an address is something the form would accept for this chain. */
function plausible(chain: Chain, a: string): boolean {
  if (chain === "cardano") return /^[0-9a-fA-F]{56}(?:[0-9a-fA-F]{2}){0,32}$/.test(a);
  if (chain === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** 0 exact ticker, 1 name or ticker starts with the query, 2 contains it, 3 no match. */
function relevance(h: { name: string; symbol: string }, q: string): number {
  const sym = h.symbol.toLowerCase();
  const name = h.name.toLowerCase();
  if (sym === q || name === q) return 0;
  if (sym.startsWith(q) || name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
  if (sym.includes(q) || name.includes(q)) return 2;
  return 3;
}

/**
 * Groups search pairs into tokens (one per chain and address), sums their liquidity and volume,
 * keeps the logo and price from the deepest pool, and returns the most liquid tokens first.
 * Chains the app doesn't support are dropped.
 */
export function parseSearch(pairs: DexSearchPair[] | null | undefined, query = ""): TokenHit[] {
  const byKey = new Map<string, TokenHit & { depth: number }>();
  for (const p of pairs ?? []) {
    const chain = CHAIN_BY_DEX.get(p.chainId ?? "");
    const address = p.baseToken?.address?.trim();
    if (!chain || !address || !plausible(chain, address)) continue;
    const key = `${chain}:${chain === "solana" ? address : address.toLowerCase()}`;
    const liq = p.liquidity?.usd ?? 0;
    const price = Number(p.priceUsd);
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, {
        chain,
        address,
        name: clip(p.baseToken?.name, 60) || clip(p.baseToken?.symbol, 20) || "Unknown",
        symbol: clip(p.baseToken?.symbol, 20),
        logo: httpsUrl(p.info?.imageUrl),
        priceUsd: Number.isFinite(price) && price > 0 ? price : null,
        marketCap: p.marketCap && p.marketCap > 0 ? p.marketCap : null,
        liquidityUsd: liq,
        volume24h: p.volume?.h24 ?? 0,
        depth: liq,
      });
      continue;
    }
    cur.liquidityUsd += liq;
    cur.volume24h += p.volume?.h24 ?? 0;
    if (p.marketCap && p.marketCap > (cur.marketCap ?? 0)) cur.marketCap = p.marketCap;
    if (liq > cur.depth) {
      cur.depth = liq;
      if (Number.isFinite(price) && price > 0) cur.priceUsd = price;
    }
    cur.logo ??= httpsUrl(p.info?.imageUrl);
  }
  const q = query.trim().toLowerCase();
  const isAddress = /^0x[0-9a-f]{6,}$/.test(q) || q.length >= 32;
  return [...byKey.values()]
    .map((h) => ({ h, rank: isAddress || !q ? 0 : relevance(h, q) }))
    // DexScreener also matches on pool names and quote tokens. A hit whose own name and ticker don't match is noise.
    .filter(({ h, rank }) => rank < 3 && h.liquidityUsd >= MIN_LIQUIDITY_USD)
    .sort((a, b) => a.rank - b.rank || b.h.liquidityUsd - a.h.liquidityUsd)
    .slice(0, MAX_HITS)
    .map(({ h }) => h)
    .map((h) => ({
      chain: h.chain,
      address: h.address,
      name: h.name,
      symbol: h.symbol,
      logo: h.logo,
      priceUsd: h.priceUsd,
      marketCap: h.marketCap,
      liquidityUsd: h.liquidityUsd,
      volume24h: h.volume24h,
    }));
}

/**
 * Whether what's typed in the address box should trigger a search. Not when it already is a valid address for
 * the chosen chain (the details card handles that), and not when it is a half-typed address, which would only
 * return noise. A complete address for a different chain does search, so pasting one finds it and switches the chain.
 */
export function shouldSearch(input: string, chain: Chain): boolean {
  const q = input.trim();
  if (q.length < 2) return false;
  if (validateAddress(q, chain) === null) return false;
  if (/^0x[0-9a-f]*$/i.test(q) && q.length < 42) return false;
  if (/^[0-9a-f]{10,}$/i.test(q) && q.length < 56) return false;
  return true;
}

export type SortKey ="marketCap" | "liquidity" | "volume" | "relevance";

export const SORT_LABELS: Record<SortKey, string> = {
  marketCap: "Market cap",
  liquidity: "Liquidity",
  volume: "24h volume",
  relevance: "Best match",
};

/**
 * Reorders hits without changing them. "relevance" keeps the server's order (match quality, then liquidity).
 * The other keys sort largest first; a token with no value for that key goes last, and ties keep the server's order.
 */
export function sortHits(hits: TokenHit[], key: SortKey): TokenHit[] {
  if (key === "relevance") return hits;
  // Anything that isn't a number counts as missing, including a field an older cached response didn't have.
  const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const value = (h: TokenHit): number | null => num(key === "marketCap" ? h.marketCap : key === "liquidity" ? h.liquidityUsd : h.volume24h);
  return hits
    .map((h, i) => ({ h, i, v: value(h) }))
    .sort((a, b) => (a.v === null) !== (b.v === null) ? (a.v === null ? 1 : -1) : (b.v ?? 0) - (a.v ?? 0) || a.i - b.i)
    .map((x) => x.h);
}
