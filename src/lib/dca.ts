import { HttpError } from "./http.ts";
import { addDays, monthsBetween, targetDate, todayUtc } from "./months.ts";
import {
  cgDaily,
  cgResolve,
  coingeckoConfig,
  gtDaily,
  gtTopPool,
  type ResolvedToken,
} from "./providers.ts";
import { selectAllMonths } from "./select.ts";
import type { DailyPoint, DcaRequest, DcaResponse, PriceSource, SourceLink } from "./types.ts";

export class DcaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function runDca(req: DcaRequest, now: number = Date.now()): Promise<DcaResponse> {
  const today = todayUtc(now);
  const months = monthsBetween(req.startMonth, req.endMonth);
  const firstTarget = targetDate(months[0], req.basis, req.basisDay);
  const lastTarget = targetDate(months[months.length - 1], req.basis, req.basisDay);
  const from = addDays(firstTarget, -3);
  const toWanted = addDays(lastTarget, 3);
  const to = toWanted > today ? today : toWanted;

  const cfg = coingeckoConfig();
  const warnings: string[] = [];
  const sources: SourceLink[] = [];

  let points: DailyPoint[] = [];
  let source: PriceSource = "none";
  let token: ResolvedToken = { id: null, symbol: null, name: null, price: null };
  let earliestAllowed: string | null = null;

  // 1. GeckoTerminal pool (EVM + Solana). Free, full history. No pools => fall through.
  try {
    const pool = await gtTopPool(req.chain, req.address);
    if (pool) {
      const pts = await gtDaily(pool, from, to);
      if (pts.length) {
        points = pts;
        source = "GeckoTerminal";
        token = { id: null, symbol: pool.symbol, name: pool.name, price: pool.price };
        sources.push({
          label: "GeckoTerminal pool (daily OHLCV)",
          url: `https://www.geckoterminal.com/${pool.network}/pools/${pool.pool}`,
        });
      }
    }
  } catch (e) {
    warnings.push(`GeckoTerminal unavailable (${e instanceof Error ? e.message : "error"}); using CoinGecko`);
  }

  // 2. CoinGecko coin endpoints (always the route for Cardano, and the fallback elsewhere).
  let cg: ResolvedToken | null = null;
  try {
    cg = await cgResolve(req.chain, req.address, cfg);
  } catch (e) {
    if (source === "none") {
      if (e instanceof HttpError && e.status === 429) throw new DcaError(429, "Rate limited by CoinGecko. Wait a minute and retry, or set COINGECKO_API_KEY.");
      throw new DcaError(502, `Could not reach CoinGecko: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  if (cg) {
    if (source === "none") {
      token = cg;
      earliestAllowed = cfg.historyLimitDays ? addDays(today, -(cfg.historyLimitDays - 1)) : null;
      const cgFrom = earliestAllowed && from < earliestAllowed ? earliestAllowed : from;
      try {
        points = await cgDaily(cg.id as string, cgFrom, to, cfg);
      } catch (e) {
        if (e instanceof HttpError && e.status === 429) throw new DcaError(429, "Rate limited by CoinGecko. Wait a minute and retry, or set COINGECKO_API_KEY.");
        throw new DcaError(502, `CoinGecko price history failed: ${e instanceof Error ? e.message : "error"}`);
      }
      source = "CoinGecko";
      sources.push({ label: "CoinGecko coin page", url: `https://www.coingecko.com/en/coins/${cg.id}` });
      if (earliestAllowed && from < earliestAllowed) {
        warnings.push(
          `The free CoinGecko tier only serves the last ${cfg.historyLimitDays} days (from ${earliestAllowed}). Older months show n/a. Set a paid COINGECKO_API_KEY with COINGECKO_PLAN=pro for full history.`,
        );
      }
    } else if (cg.price !== null) {
      token = { ...token, id: cg.id, price: cg.price, symbol: token.symbol ?? cg.symbol, name: token.name ?? cg.name };
    }
  }

  if (source === "none") {
    throw new DcaError(
      404,
      req.chain === "cardano"
        ? "No token found for this policy ID. Check the ID for typos. Cardano tokens are only looked up on CoinGecko."
        : "No token found for this address on this chain. Check the address and that the chain is the right one.",
    );
  }

  const rows = selectAllMonths(req.startMonth, req.endMonth, points, {
    basis: req.basis,
    basisDay: req.basisDay,
    source,
    today,
    earliestAllowed,
  });

  let currentPrice = token.price;
  if (currentPrice === null) {
    const last = points[points.length - 1];
    if (last && last.date === today) currentPrice = last.price;
    else warnings.push("No live price available; value today cannot be computed.");
  }

  const missing = rows.filter((r) => r.price === null).length;
  if (missing) warnings.push(`${missing} of ${rows.length} months have no price and are excluded from totals.`);

  return {
    token: { id: token.id, symbol: token.symbol, name: token.name },
    chain: req.chain,
    address: req.address,
    basis: req.basis,
    ...(req.basis === "day-of-month" && req.basisDay !== undefined ? { basisDay: req.basisDay } : {}),
    currentPrice,
    currentPriceDate: today,
    rows,
    sources,
    warnings,
  };
}
