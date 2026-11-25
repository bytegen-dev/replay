import type { ApiResult, ApiTrades } from "./service.ts";

/**
 * A scan with some coins taken out. A coin hidden from the table drops out of everything: the totals, the picture, the spreadsheet. So the card always
 * adds up to the rows that are shown. Every total is worked out again from what is left, the same way the scan works it out:
 * the fumble and round-trip are sums over the sells and positions of the coins kept, and the total fumble is the sum of each kept coin's own
 * (see missed.ts), so with nothing hidden the numbers are the scan's own.
 */
export function withoutCoins(r: ApiResult, hidden: ReadonlySet<string>): ApiResult {
  if (hidden.size === 0) return r;
  const keep = <T extends { token: string }>(list: T[]) => list.filter((x) => !hidden.has(x.token));
  return retotal({ ...r, trades: keep(r.trades), sells: keep(r.sells), positions: keep(r.positions), coins: keep(r.coins) });
}

/** A scan whose sells, positions and coins have been changed (some taken out, or one coin priced again), with every total worked out again from what it now holds. */
export function retotal(r: ApiResult): ApiResult {
  const { sells, positions, coins } = r;
  let fumbleSol = 0;
  let fumbleUsd = 0;
  let profitSol = 0;
  let profitUsd = 0;
  for (const s of sells) {
    profitSol += s.profitSol;
    profitUsd += s.profitUsd ?? 0;
    if (s.status === "ok") {
      fumbleSol += s.fumbleSol ?? 0;
      fumbleUsd += s.fumbleUsd ?? 0;
    }
  }
  let tripSol = 0;
  let tripUsd = 0;
  for (const p of positions) {
    if (p.status !== "ok") continue;
    tripSol += p.roundTripSol ?? 0;
    tripUsd += p.roundTripUsd ?? 0;
  }
  let missedSol = 0;
  let missedUsd = 0;
  for (const c of coins) {
    missedSol += c.missedSol;
    missedUsd += c.missedUsd;
  }
  return {
    ...r,
    measured: sells.filter((s) => s.status === "ok").length,
    unknown: sells.filter((s) => s.status !== "ok").length,
    freeSells: sells.filter((s) => s.freeTokens > 0).length,
    freeProceedsSol: sells.reduce((sum, s) => sum + (s.soldSol * s.freeTokens) / s.tokens, 0),
    totalFumbleSol: fumbleSol,
    totalFumbleUsd: fumbleUsd,
    totalProfitSol: profitSol,
    totalProfitUsd: profitUsd,
    totalRoundTripSol: tripSol,
    totalRoundTripUsd: tripUsd,
    totalMissedSol: missedSol,
    totalMissedUsd: missedUsd,
  };
}

/** The trade list with some coins taken out (the part of a scan that is there before it has finished). */
export function tradesWithout(t: ApiTrades, hidden: ReadonlySet<string>): ApiTrades {
  return hidden.size === 0 ? t : { ...t, trades: t.trades.filter((x) => !hidden.has(x.token)) };
}
