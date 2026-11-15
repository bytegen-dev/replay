import { getJson } from "./http.ts";
import { gtDaily, type GtPool } from "./providers.ts";
import type { DailyPoint, SourceLink } from "./types.ts";

/**
 * GeckoTerminal indexes Cardano pools, which CoinGecko's free tier can't match for history older than a
 * year. Pool prices are sparse (a candle only on days with trades) and often thin, so they only ever fill
 * days CoinGecko doesn't have, and the existing low-volume and outlier flags still apply.
 */

const GT = "https://api.geckoterminal.com/api/v2";
const MAX_POOLS = 4;

/* ------------------------------ pure parts ------------------------------ */

interface GtRel {
  data?: { id?: string };
}
interface GtPoolRow {
  attributes?: { address?: string; name?: string; reserve_in_usd?: string };
  relationships?: { base_token?: GtRel };
}

/** Full asset id (policy + token name in hex) from a pool search, matched on the policy. Null when not found. */
export function pickUnit(rows: GtPoolRow[] | undefined, policy: string): string | null {
  const want = `cardano_${policy.toLowerCase()}`;
  for (const r of rows ?? []) {
    const id = r.relationships?.base_token?.data?.id?.toLowerCase();
    if (id && id.startsWith(want) && /^cardano_[0-9a-f]+$/.test(id)) return id.slice("cardano_".length);
  }
  return null;
}

export interface CardanoPool {
  address: string;
  name: string;
  liquidity: number;
}

/** Pools where the token is the base asset (so OHLCV is in the token's price), deepest first, capped. */
export function parsePools(rows: GtPoolRow[] | undefined, unit: string): CardanoPool[] {
  const want = `cardano_${unit.toLowerCase()}`;
  const out: CardanoPool[] = [];
  for (const r of rows ?? []) {
    const a = r.attributes;
    if (!a?.address || !/^[0-9a-f]+$/i.test(a.address)) continue;
    if (r.relationships?.base_token?.data?.id?.toLowerCase() !== want) continue;
    out.push({ address: a.address, name: a.name ?? "pool", liquidity: Number(a.reserve_in_usd) || 0 });
  }
  return out.sort((a, b) => b.liquidity - a.liquidity).slice(0, MAX_POOLS);
}

/** One point per day across several pools: the day's most-traded pool wins, ties go to the deeper pool (earlier in the list). */
export function mergeDailySeries(series: DailyPoint[][]): DailyPoint[] {
  const best = new Map<string, DailyPoint>();
  for (const s of series) {
    for (const p of s) {
      const cur = best.get(p.date);
      if (!cur || (p.volume ?? 0) > (cur.volume ?? 0)) best.set(p.date, p);
    }
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** `primary` wins on any day it has; `fill` only supplies days `primary` lacks. */
export function fillGaps(primary: DailyPoint[], fill: DailyPoint[]): DailyPoint[] {
  const have = new Set(primary.map((p) => p.date));
  return [...primary, ...fill.filter((p) => !have.has(p.date))].sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------------------- network parts ---------------------------- */

export interface CardanoSeries {
  points: DailyPoint[];
  sources: SourceLink[];
  symbol: string | null;
  name: string | null;
  price: number | null;
}

/**
 * Daily prices for a Cardano token from its GeckoTerminal pools, or null when GeckoTerminal doesn't know it.
 * `unit` is the full asset id if the user pasted it. Otherwise it is found by searching `hint` (the token's
 * symbol or name) and matching on the policy id.
 */
export async function gtCardanoSeries(
  policy: string,
  unit: string | undefined,
  hint: string | null,
  from: string,
  to: string,
): Promise<CardanoSeries | null> {
  let asset = unit?.toLowerCase();
  if (!asset && hint) {
    const q = encodeURIComponent(hint.replace(/^\$/, "").trim());
    const found = await getJson<{ data?: GtPoolRow[] }>(`${GT}/search/pools?query=${q}&network=cardano&page=1`);
    asset = pickUnit(found.data, policy) ?? undefined;
  }
  if (!asset) return null;

  const [poolsRes, token] = await Promise.all([
    getJson<{ data?: GtPoolRow[] }>(`${GT}/networks/cardano/tokens/${asset}/pools?page=1`),
    getJson<{ data?: { attributes?: { price_usd?: string; symbol?: string; name?: string } } }>(`${GT}/networks/cardano/tokens/${asset}`).catch(() => null),
  ]);
  const pools = parsePools(poolsRes.data, asset);
  if (!pools.length) return null;

  const series: DailyPoint[][] = [];
  const used: CardanoPool[] = [];
  let lastErr: unknown;
  for (const p of pools) {
    const gt: GtPool = { network: "cardano", pool: p.address, symbol: null, name: null, price: null };
    try {
      const pts = await gtDaily(gt, from, to);
      if (pts.length) {
        series.push(pts);
        used.push(p);
      }
    } catch (e) {
      lastErr = e; // one pool failing shouldn't lose the others
    }
  }
  if (!series.length) {
    if (lastErr) throw lastErr;
    return null;
  }

  const a = token?.data?.attributes;
  return {
    points: mergeDailySeries(series).map((p) => ({ ...p, source: "GeckoTerminal" as const })),
    sources: used.map((p) => ({ label: `GeckoTerminal pool ${p.name} (daily OHLCV)`, url: `https://www.geckoterminal.com/cardano/pools/${p.address}` })),
    symbol: a?.symbol?.replace(/^\$/, "").toUpperCase() ?? null,
    name: a?.name ?? null,
    price: a?.price_usd ? Number(a.price_usd) : null,
  };
}
