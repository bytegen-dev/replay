import type { Trade } from "./types.ts";

/**
 * Matches each sell to the buys it came from, first in first out, so "this sell" has a cost and a result.
 *
 * Tokens with no known cost are free: a transfer in or an airdrop (a trade with `source: "received"`, which the scan adds in the order it arrived), and tokens
 * sold that no buy or transfer in the history accounts for (bought before the history starts, or arrived some way that was not read). That is how wallet trackers
 * count them: their whole sale is profit. So every sell is fully matched, some of it at a cost of zero, and `freeTokens` says how much, so the figure can say so.
 */

export interface SellLot {
  sell: Trade;
  /** Tokens of this sell that were given a cost: all of them, since tokens with no known cost are given a cost of zero. */
  matchedTokens: number;
  /** SOL paid for the tokens that were bought (the free ones add nothing). */
  costSol: number;
  /** Tokens of this sell that were free: received by transfer, or with no buy or transfer in the history behind them. */
  freeTokens: number;
  /** SOL received for the sale, minus its cost. */
  profitSol: number;
}

export function matchLots(trades: Trade[]): SellLot[] {
  // Oldest first; a buy and a sell in the same second keep the order they came in, buy first.
  const ordered = trades
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.time - b.t.time || (a.t.side === b.t.side ? a.i - b.i : a.t.side === "buy" ? -1 : 1))
    .map((x) => x.t);

  const open = new Map<string, { tokens: number; solPerToken: number; free: boolean }[]>();
  const out: SellLot[] = [];
  for (const t of ordered) {
    if (t.side === "buy") {
      const q = open.get(t.mint) ?? [];
      q.push({ tokens: t.tokens, solPerToken: t.sol / t.tokens, free: t.source === "received" });
      open.set(t.mint, q);
      continue;
    }
    const q = open.get(t.mint) ?? [];
    let left = t.tokens;
    let cost = 0;
    let free = 0;
    while (left > 1e-9 && q.length) {
      const lot = q[0];
      const take = Math.min(lot.tokens, left);
      cost += take * lot.solPerToken;
      if (lot.free) free += take;
      lot.tokens -= take;
      left -= take;
      if (lot.tokens <= 1e-9) q.shift();
    }
    // What is left was not bought and not received in the history: free too.
    const unknown = Math.max(0, left);
    out.push({ sell: t, matchedTokens: t.tokens, costSol: cost, freeTokens: free + unknown, profitSol: t.sol - cost });
  }
  return out;
}
