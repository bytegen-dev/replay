import type { Trade } from "./types.ts";

/**
 * Matches each sell to the buys it came from, first in first out, so "this sell" has a cost and a result.
 *
 * A wallet's history is cut off at some point, so a sell can include tokens that were bought before the history starts (or
 * were received some other way). Those tokens have no known cost: they are reported as `unmatchedTokens`, and the profit
 * figure covers only the matched part.
 */

export interface SellLot {
  sell: Trade;
  /** Tokens of this sell that were matched to a known buy. */
  matchedTokens: number;
  /** SOL paid for the matched tokens. */
  costSol: number;
  /** Tokens sold that no buy in the history accounts for. */
  unmatchedTokens: number;
  /** SOL received for the matched tokens, minus their cost. Zero when nothing matched. */
  profitSol: number;
}

export function matchLots(trades: Trade[]): SellLot[] {
  // Oldest first; a buy and a sell in the same second keep the order they came in, buy first.
  const ordered = trades
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.time - b.t.time || (a.t.side === b.t.side ? a.i - b.i : a.t.side === "buy" ? -1 : 1))
    .map((x) => x.t);

  const open = new Map<string, { tokens: number; solPerToken: number }[]>();
  const out: SellLot[] = [];
  for (const t of ordered) {
    if (t.side === "buy") {
      const q = open.get(t.mint) ?? [];
      q.push({ tokens: t.tokens, solPerToken: t.sol / t.tokens });
      open.set(t.mint, q);
      continue;
    }
    const q = open.get(t.mint) ?? [];
    let left = t.tokens;
    let cost = 0;
    let matched = 0;
    while (left > 1e-9 && q.length) {
      const lot = q[0];
      const take = Math.min(lot.tokens, left);
      cost += take * lot.solPerToken;
      matched += take;
      lot.tokens -= take;
      left -= take;
      if (lot.tokens <= 1e-9) q.shift();
    }
    const proceedsOfMatched = matched > 0 ? (t.sol * matched) / t.tokens : 0;
    out.push({ sell: t, matchedTokens: matched, costSol: cost, unmatchedTokens: Math.max(0, left), profitSol: proceedsOfMatched - cost });
  }
  return out;
}
