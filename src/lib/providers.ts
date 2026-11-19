import { getJson, HttpError } from "./http.ts";
import { addDays, toDateString } from "./months.ts";
import type { Chain, DailyPoint } from "./types.ts";

/* ----------------------------- CoinGecko ----------------------------- */

const CG_PLATFORM: Record<Chain, string> = {
  cardano: "cardano",
  ethereum: "ethereum",
  solana: "solana",
  base: "base",
  bsc: "binance-smart-chain",
  arbitrum: "arbitrum-one",
  hyperevm: "hyperevm",
};

interface CgConfig {
  base: string;
  headers: Record<string, string>;
  /** Free (no key) and Demo plans only serve the last 365 days of history. */
  historyLimitDays: number | null;
}

export function coingeckoConfig(env: Record<string, string | undefined> = process.env): CgConfig {
  const key = env.COINGECKO_API_KEY?.trim();
  if (!key) return { base: "https://api.coingecko.com/api/v3", headers: {}, historyLimitDays: 365 };
  if ((env.COINGECKO_PLAN ?? "demo").toLowerCase() === "pro") {
    return { base: "https://pro-api.coingecko.com/api/v3", headers: { "x-cg-pro-api-key": key }, historyLimitDays: null };
  }
  return { base: "https://api.coingecko.com/api/v3", headers: { "x-cg-demo-api-key": key }, historyLimitDays: 365 };
}

export interface ResolvedToken {
  id: string | null;
  symbol: string | null;
  name: string | null;
  /** USD, null if unknown. */
  price: number | null;
}

export async function cgResolve(chain: Chain, address: string, cfg = coingeckoConfig()): Promise<ResolvedToken | null> {
  const addr = chain === "cardano" || chain === "solana" ? address : address.toLowerCase();
  try {
    const d = await getJson<{
      id: string;
      symbol: string;
      name: string;
      market_data?: { current_price?: { usd?: number } };
    }>(
      `${cfg.base}/coins/${CG_PLATFORM[chain]}/contract/${encodeURIComponent(addr)}`,
      cfg.headers,
    );
    return { id: d.id, symbol: d.symbol, name: d.name, price: d.market_data?.current_price?.usd ?? null };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

/** Daily USD prices + volumes, one point per UTC day. */
export async function cgDaily(id: string, from: string, to: string, cfg = coingeckoConfig()): Promise<DailyPoint[]> {
  const f = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
  const t = Math.floor(new Date(`${addDays(to, 1)}T00:00:00Z`).getTime() / 1000);
  const d = await getJson<{ prices: [number, number][]; total_volumes: [number, number][] }>(
    `${cfg.base}/coins/${id}/market_chart/range?vs_currency=usd&from=${f}&to=${t}`,
    cfg.headers,
  );
  const vol = new Map<string, number>();
  for (const [ts, v] of d.total_volumes ?? []) {
    const day = toDateString(ts);
    if (!vol.has(day)) vol.set(day, v);
  }
  // Ranges over 90 days come back daily; shorter ones hourly. Keep the first point of each day.
  const out = new Map<string, DailyPoint>();
  for (const [ts, price] of d.prices ?? []) {
    const day = toDateString(ts);
    if (price > 0 && !out.has(day)) out.set(day, { date: day, price, volume: vol.get(day) });
  }
  return [...out.values()];
}

/* ---------------------------- GeckoTerminal --------------------------- */

const GT_NETWORK: Partial<Record<Chain, string>> = {
  ethereum: "eth",
  solana: "solana",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  hyperevm: "hyperevm",
};

const GT = "https://api.geckoterminal.com/api/v2";

export interface GtPool {
  network: string;
  pool: string;
  symbol: string | null;
  name: string | null;
  price: number | null;
}

/** Top pool (GeckoTerminal sorts by liquidity). Null when the chain/token has no pools. */
export async function gtTopPool(chain: Chain, address: string): Promise<GtPool | null> {
  const network = GT_NETWORK[chain];
  if (!network) return null;
  try {
    const [pools, token] = await Promise.all([
      getJson<{ data?: { attributes?: { address?: string } }[] }>(`${GT}/networks/${network}/tokens/${address}/pools?page=1`),
      getJson<{ data?: { attributes?: { price_usd?: string; symbol?: string; name?: string } } }>(
        `${GT}/networks/${network}/tokens/${address}`,
      ).catch(() => null),
    ]);
    const pool = pools.data?.[0]?.attributes?.address;
    if (!pool) return null;
    const a = token?.data?.attributes;
    return {
      network,
      pool,
      symbol: a?.symbol ?? null,
      name: a?.name ?? null,
      price: a?.price_usd ? Number(a.price_usd) : null,
    };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

/** Daily closes for a pool. `volume` from OHLCV is USD. Pages backwards, up to 3 x 1000 days. */
export async function gtDaily(pool: GtPool, from: string, to: string): Promise<DailyPoint[]> {
  const out = new Map<string, DailyPoint>();
  let before = Math.floor(new Date(`${addDays(to, 1)}T00:00:00Z`).getTime() / 1000);
  const fromTs = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
  for (let page = 0; page < 3; page++) {
    const d = await getJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
      `${GT}/networks/${pool.network}/pools/${pool.pool}/ohlcv/day?aggregate=1&limit=1000&currency=usd&before_timestamp=${before}`,
    );
    const list = d.data?.attributes?.ohlcv_list ?? [];
    if (!list.length) break;
    let oldest = before;
    for (const [ts, , , , close, volume] of list) {
      oldest = Math.min(oldest, ts);
      if (close > 0) out.set(toDateString(ts * 1000), { date: toDateString(ts * 1000), price: close, volume });
    }
    if (oldest <= fromTs || list.length < 1000) break;
    before = oldest;
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
