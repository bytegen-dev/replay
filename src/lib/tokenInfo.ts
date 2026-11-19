import type { Chain } from "./types.ts";

/** Pure merge logic for the token details card. No network here, so it is easy to test. */

export interface TokenLink {
  label: string;
  url: string;
}

export interface TokenInfo {
  name: string | null;
  symbol: string | null;
  logo: string | null;
  banner: string | null;
  description: string | null;
  priceUsd: number | null;
  change24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  poolCount: number;
  /** The earliest date the token can have a price (YYYY-MM-DD): its oldest pool, or CoinGecko's genesis date, whichever is earlier. */
  launchedAt: string | null;
  rank: number | null;
  links: TokenLink[];
  sources: TokenLink[];
  /** Plain-language notes about missing or partial data. */
  notes: string[];
}

/** The slice of CoinGecko's coin response we read. */
export interface CgCoin {
  id?: string;
  symbol?: string;
  name?: string;
  description?: { en?: string };
  genesis_date?: string | null;
  image?: { large?: string; small?: string };
  market_cap_rank?: number | null;
  links?: {
    homepage?: string[];
    blockchain_site?: string[];
    chat_url?: string[];
    twitter_screen_name?: string;
    telegram_channel_identifier?: string;
  };
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    fully_diluted_valuation?: { usd?: number };
    total_volume?: { usd?: number };
    price_change_percentage_24h?: number | null;
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
  };
}

/** The slice of a DexScreener pair we read. */
export interface DexPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  /** When the pool was created, in milliseconds. */
  pairCreatedAt?: number;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  fdv?: number;
  marketCap?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    websites?: { label?: string; url?: string }[];
    socials?: { type?: string; url?: string }[];
  };
}

/** DexScreener's id for each chain. Cardano is not covered. */
export const DEX_CHAIN: Record<Chain, string | null> = {
  cardano: null,
  ethereum: "ethereum",
  solana: "solana",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  hyperevm: "hyperevm",
};

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const pos = (x: unknown): number | null => {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

/** Only plain https URLs get through, so a card can never carry a javascript: or data: link. */
export function httpsUrl(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const u = x.trim();
  if (!/^https:\/\/[^\s"'<>]+$/.test(u) || u.length > 500) return null;
  return u;
}

/** HTML in, short plain text out (CoinGecko descriptions carry tags and entities). */
export function cleanText(html: unknown, max = 360): string | null {
  if (typeof html !== "string") return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40))}…`;
}

/** Pairs on this chain where the token is the base asset. Solana mints are case-sensitive, EVM addresses are not. */
export function matchingPairs(pairs: DexPair[], chain: Chain, address: string): DexPair[] {
  const dex = DEX_CHAIN[chain];
  if (!dex) return [];
  const want = chain === "solana" ? address : address.toLowerCase();
  return pairs.filter((p) => {
    const a = p.baseToken?.address ?? "";
    return p.chainId === dex && (chain === "solana" ? a : a.toLowerCase()) === want;
  });
}

function addLink(out: TokenLink[], label: string, url: unknown) {
  const u = httpsUrl(url);
  // twitter.com and x.com are the same account; a trailing slash changes nothing.
  const same = (s: string) => s.toLowerCase().replace("//twitter.com/", "//x.com/").replace("//www.", "//").replace(/\/$/, "");
  if (u && !out.some((l) => same(l.url) === same(u)) && out.length < 8) out.push({ label: /^(twitter|x)$/i.test(label) ? "X" : label, url: u });
}

/**
 * Merges CoinGecko and DexScreener. CoinGecko leads for identity, supply and market cap; DexScreener
 * leads for live price, liquidity and volume on the chain. Anything a source doesn't give stays null.
 * Returns null when neither source knows the token.
 */
export function buildTokenInfo(cg: CgCoin | null, rawPairs: DexPair[], chain: Chain, address: string): TokenInfo | null {
  const pairs = matchingPairs(rawPairs, chain, address).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const top = pairs[0];
  if (!cg && !top) return null;

  const md = cg?.market_data;
  const liquidity = pairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
  const volume = pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);

  const links: TokenLink[] = [];
  addLink(links, "Website", cg?.links?.homepage?.find((u) => httpsUrl(u)));
  for (const w of top?.info?.websites ?? []) addLink(links, w.label?.slice(0, 24) || "Website", w.url);
  if (cg?.links?.twitter_screen_name && /^\w{1,15}$/.test(cg.links.twitter_screen_name)) addLink(links, "X", `https://x.com/${cg.links.twitter_screen_name}`);
  if (cg?.links?.telegram_channel_identifier && /^\w{3,64}$/.test(cg.links.telegram_channel_identifier)) addLink(links, "Telegram", `https://t.me/${cg.links.telegram_channel_identifier}`);
  addLink(links, "Discord", cg?.links?.chat_url?.find((u) => /discord/i.test(u)));
  for (const s of top?.info?.socials ?? []) addLink(links, s.type ? s.type[0].toUpperCase() + s.type.slice(1, 24) : "Link", s.url);
  addLink(links, "Explorer", cg?.links?.blockchain_site?.find((u) => httpsUrl(u)));

  const sources: TokenLink[] = [];
  if (cg?.id) addLink(sources, "CoinGecko", `https://www.coingecko.com/en/coins/${cg.id}`);
  if (top?.url) addLink(sources, "DexScreener", top.url);

  const created = pairs.map((p) => p.pairCreatedAt).filter((n): n is number => typeof n === "number" && n > 0);
  const fromPools = created.length ? new Date(Math.min(...created)).toISOString().slice(0, 10) : null;
  const genesis = typeof cg?.genesis_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cg.genesis_date) ? cg.genesis_date : null;
  const launchedAt = [fromPools, genesis].filter((d): d is string => d !== null).sort()[0] ?? null;

  const notes: string[] = [];
  if (!cg) notes.push("Not listed on CoinGecko, so supply and market cap are missing.");
  if (!top && DEX_CHAIN[chain]) notes.push("No DEX pool found on DexScreener, so liquidity and volume are missing.");
  if (chain === "cardano") notes.push("Liquidity and volume are not available for Cardano tokens.");

  return {
    name: cg?.name ?? top?.baseToken?.name ?? null,
    symbol: cg?.symbol ? cg.symbol.replace(/^\$/, "").toUpperCase() : (top?.baseToken?.symbol ?? null),
    logo: httpsUrl(cg?.image?.large) ?? httpsUrl(cg?.image?.small) ?? httpsUrl(top?.info?.imageUrl),
    banner: httpsUrl(top?.info?.header),
    description: cleanText(cg?.description?.en),
    priceUsd: pos(top?.priceUsd) ?? pos(md?.current_price?.usd),
    change24h: num(top?.priceChange?.h24) ?? num(md?.price_change_percentage_24h),
    marketCap: pos(md?.market_cap?.usd) ?? pos(top?.marketCap),
    fdv: pos(md?.fully_diluted_valuation?.usd) ?? pos(top?.fdv),
    circulatingSupply: pos(md?.circulating_supply),
    totalSupply: pos(md?.total_supply),
    maxSupply: pos(md?.max_supply),
    volume24h: pairs.length ? volume : pos(md?.total_volume?.usd),
    liquidityUsd: pairs.length ? liquidity : null,
    poolCount: pairs.length,
    launchedAt,
    rank: pos(cg?.market_cap_rank),
    links,
    sources,
    notes,
  };
}
