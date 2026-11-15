import { getJson, HttpError } from "./http.ts";
import { coingeckoConfig } from "./providers.ts";
import { buildTokenInfo, DEX_CHAIN, type CgCoin, type DexPair, type TokenInfo } from "./tokenInfo.ts";
import type { Chain } from "./types.ts";

const CG_PLATFORM: Record<Chain, string> = {
  cardano: "cardano",
  ethereum: "ethereum",
  solana: "solana",
  base: "base",
  bsc: "binance-smart-chain",
  arbitrum: "arbitrum-one",
};

/** CoinGecko coin by contract. A 404 means "not listed", not an error. Other failures become a note. */
async function fetchCoin(chain: Chain, address: string): Promise<{ coin: CgCoin | null; note?: string }> {
  const cfg = coingeckoConfig();
  const addr = chain === "cardano" || chain === "solana" ? address : address.toLowerCase();
  try {
    const coin = await getJson<CgCoin>(`${cfg.base}/coins/${CG_PLATFORM[chain]}/contract/${encodeURIComponent(addr)}?localization=false&tickers=false&community_data=false&developer_data=false`, cfg.headers);
    return { coin };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return { coin: null };
    return { coin: null, note: e instanceof HttpError && e.status === 429 ? "CoinGecko is rate limiting, so some details are missing." : "CoinGecko was unreachable, so some details are missing." };
  }
}

async function fetchPairs(chain: Chain, address: string): Promise<{ pairs: DexPair[]; note?: string }> {
  if (!DEX_CHAIN[chain]) return { pairs: [] };
  try {
    const d = await getJson<{ pairs?: DexPair[] | null }>(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`);
    return { pairs: d.pairs ?? [] };
  } catch {
    return { pairs: [], note: "DexScreener was unreachable, so liquidity and volume are missing." };
  }
}

/** Token details from CoinGecko and DexScreener, fetched together. Null when neither knows the token. */
export async function loadTokenInfo(chain: Chain, address: string): Promise<TokenInfo | null> {
  const [cg, dex] = await Promise.all([fetchCoin(chain, address), fetchPairs(chain, address)]);
  const info = buildTokenInfo(cg.coin, dex.pairs, chain, address);
  if (info) info.notes.push(...[cg.note, dex.note].filter((n): n is string => !!n));
  return info;
}
