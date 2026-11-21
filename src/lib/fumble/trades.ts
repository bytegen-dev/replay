import type { Dropped, Trade } from "./types.ts";

/**
 * Turns a wallet's transaction history (Helius "enhanced" transactions) into trades.
 *
 * It does not trust the provider's own swap summary: Helius leaves it out for swaps routed through some routers (Titan, for
 * one), so reading the summary alone drops a large share of real trades. Instead every transaction is read the same way, from
 * what changed in the wallet: its SOL balance, its wrapped-SOL balance, and the one other token that moved. Whatever router
 * did the work, the wallet either ended up with more of the token and less SOL (a buy) or the other way round (a sell).
 *
 * Known small errors, kept on purpose because they are cheap to explain: opening a token account costs about 0.002 SOL of rent
 * and closing one returns it, which shifts a trade's SOL by that much. Token amounts go through plain numbers, which is exact
 * far past any real memecoin supply.
 */

export const WSOL = "So11111111111111111111111111111111111111112";

/** Below this much SOL moving, a transaction is not treated as a trade (it is rent, a tip or dust). */
export const MIN_SOL_MOVE = 0.001;

/** The parts of a Helius enhanced transaction the parser reads. */
export interface HeliusTx {
  signature: string;
  timestamp: number;
  feePayer: string;
  /** Lamports. */
  fee: number;
  source?: string;
  type?: string;
  accountData?: {
    account: string;
    /** Lamports. */
    nativeBalanceChange: number;
    tokenBalanceChanges?: { userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
  }[];
}

export interface ParsedHistory {
  trades: Trade[];
  dropped: Dropped;
}

export function parseTrades(wallet: string, txs: HeliusTx[]): ParsedHistory {
  const trades: Trade[] = [];
  const dropped: Dropped = { noTokenMove: 0, multiToken: 0, noSolLeg: 0 };

  for (const t of txs) {
    let lamports = 0;
    const moved = new Map<string, number>();
    for (const a of t.accountData ?? []) {
      if (a.account === wallet) lamports += a.nativeBalanceChange;
      for (const c of a.tokenBalanceChanges ?? []) {
        if (c.userAccount !== wallet) continue;
        const amount = Number(c.rawTokenAmount.tokenAmount) / 10 ** c.rawTokenAmount.decimals;
        moved.set(c.mint, (moved.get(c.mint) ?? 0) + amount);
      }
    }
    // The fee is the cost of sending, not part of the price paid for the token.
    if (t.feePayer === wallet) lamports += t.fee;
    const sol = lamports / 1e9 + (moved.get(WSOL) ?? 0);
    moved.delete(WSOL);

    const tokens = [...moved].filter(([, d]) => d !== 0);
    if (tokens.length === 0) {
      dropped.noTokenMove++;
      continue;
    }
    if (tokens.length > 1) {
      dropped.multiToken++;
      continue;
    }
    const [mint, delta] = tokens[0];
    const base = { mint, tokens: Math.abs(delta), time: t.timestamp, signature: t.signature, source: t.source };
    if (delta < 0 && sol > MIN_SOL_MOVE) trades.push({ ...base, side: "sell", sol });
    else if (delta > 0 && sol < -MIN_SOL_MOVE) trades.push({ ...base, side: "buy", sol: -sol });
    else dropped.noSolLeg++;
  }

  trades.sort((a, b) => a.time - b.time);
  return { trades, dropped };
}
