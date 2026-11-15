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
import { dexhunterSeries } from "./dexhunter.ts";
import { fillGaps, gtCardanoSeries, resolveCardanoUnit } from "./gtCardano.ts";
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
  let freeTierWarning: string | null = null;

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
        // Only shown if months are still empty after the other sources have had their turn (see below).
        freeTierWarning = `The free CoinGecko tier only serves the last ${cfg.historyLimitDays} days (from ${earliestAllowed}). Older months with no other source show n/a. Set a paid COINGECKO_API_KEY with COINGECKO_PLAN=pro for full history.`;
      }
    } else if (cg.price !== null) {
      token = { ...token, id: cg.id, price: cg.price, symbol: token.symbol ?? cg.symbol, name: token.name ?? cg.name };
    }
  }

  if (source === "none" && req.chain === "cardano" && req.unit) {
    try {
      const gt = await gtCardanoSeries(req.address, req.unit, null, from, to);
      if (gt) {
        points = gt.points;
        source = "GeckoTerminal";
        token = { id: null, symbol: gt.symbol, name: gt.name, price: gt.price };
        sources.push(...gt.sources);
      }
    } catch (e) {
      warnings.push(`GeckoTerminal unavailable (${e instanceof Error ? e.message : "error"})`);
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

  const selectOpts = { basis: req.basis, basisDay: req.basisDay, source, today, earliestAllowed };
  let rows = selectAllMonths(req.startMonth, req.endMonth, points, selectOpts);

  // Cardano: CoinGecko's free tier stops at 365 days. Months it can't price are filled, only for those
  // days and only when something is actually missing: first from DexHunter's complete daily charts, then
  // from GeckoTerminal's thin pools for whatever is still empty. CoinGecko always wins where it has a price.
  const gaps = (rs: typeof rows) => rs.filter((r) => r.price === null && !r.notes.some((n) => n.code === "future"));
  if (req.chain === "cardano" && source === "CoinGecko" && gaps(rows).length) {
    const hint = token.symbol ?? token.name;
    let unit = req.unit;
    points = points.map((p) => ({ ...p, source: "CoinGecko" as const }));

    try {
      unit = (await resolveCardanoUnit(req.address, req.unit, hint)) ?? undefined;
      if (unit) {
        const targets = gaps(rows).map((r) => r.targetDate).sort();
        const spanFrom = addDays(targets[0], -7);
        const spanTo = addDays(targets[targets.length - 1], 7);
        const dh = await dexhunterSeries(unit, spanFrom, spanTo > today ? today : spanTo);
        if (dh) {
          points = fillGaps(points, dh.points);
          rows = selectAllMonths(req.startMonth, req.endMonth, points, selectOpts);
          const used = rows.filter((r) => r.source === "DexHunter");
          if (used.length) {
            sources.push(...dh.sources);
            warnings.push(
              `${used.length} older ${used.length === 1 ? "month uses" : "months use"} DexHunter prices (${used.map((r) => r.month).join(", ")}): ADA-pair prices across Cardano DEXs, converted to USD with Bitstamp's ADA/USD close. Check the Note column for thin trading.`,
            );
          }
        }
      }
    } catch (e) {
      warnings.push(`DexHunter prices were unavailable (${e instanceof Error ? e.message : "error"}).`);
    }

    if (gaps(rows).length) {
      try {
        const gt = await gtCardanoSeries(req.address, unit, hint, from, to);
        if (gt) {
          points = fillGaps(points, gt.points);
          rows = selectAllMonths(req.startMonth, req.endMonth, points, selectOpts);
          const used = rows.filter((r) => r.source === "GeckoTerminal");
          if (used.length) {
            sources.push(...gt.sources);
            warnings.push(
              `${used.length} older ${used.length === 1 ? "month uses" : "months use"} GeckoTerminal pool prices (${used.map((r) => r.month).join(", ")}). Cardano pools are thin and trade on few days, so check the Note column.`,
            );
          }
        }
      } catch (e) {
        warnings.push(`GeckoTerminal pool prices were unavailable (${e instanceof Error ? e.message : "error"}); older months stay n/a.`);
      }
    }
  }

  if (freeTierWarning && rows.some((r) => r.notes.some((n) => n.code === "out-of-range"))) warnings.unshift(freeTierWarning);

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
