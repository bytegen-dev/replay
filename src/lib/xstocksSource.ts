import { getJson } from "./http.ts";
import { coingeckoConfig } from "./providers.ts";
import { joinXStocks, type MarketCoin, type XStock } from "./xstocks.ts";

const CATEGORY = "xstocks-ecosystem";
const MAX_PAGES = 3;
const TTL_MS = 60 * 60 * 1000;

let cached: { at: number; stocks: XStock[] } | null = null;
let inflight: Promise<XStock[]> | null = null;

async function fetchXStocks(): Promise<XStock[]> {
  const cfg = coingeckoConfig();
  const markets: MarketCoin[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = await getJson<MarketCoin[]>(
      `${cfg.base}/coins/markets?vs_currency=usd&category=${CATEGORY}&per_page=250&page=${page}`,
      cfg.headers,
    );
    markets.push(...rows);
    if (rows.length < 250) break;
  }
  const all = await getJson<{ id: string; platforms?: Record<string, string> }[]>(`${cfg.base}/coins/list?include_platform=true`, cfg.headers);
  const platforms: Record<string, string | undefined> = {};
  for (const c of all) platforms[c.id] = c.platforms?.solana;
  return joinXStocks(markets, platforms);
}

/** The Solana xStocks list, refreshed at most once an hour and shared by concurrent requests. */
export async function loadXStocks(now = Date.now()): Promise<XStock[]> {
  if (cached && now - cached.at < TTL_MS) return cached.stocks;
  inflight ??= fetchXStocks()
    .then((stocks) => {
      cached = { at: Date.now(), stocks };
      return stocks;
    })
    .finally(() => {
      inflight = null;
    });
  try {
    return await inflight;
  } catch (e) {
    // Serve a stale list rather than an error if CoinGecko is rate limiting us.
    if (cached) return cached.stocks;
    throw e;
  }
}
