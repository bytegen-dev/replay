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

/** Dollar stablecoins a coin can be paid for in (USDC and USDT). Each is worth one dollar, so its amount is the dollar price paid. */
export const STABLES = new Set(["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);

/** Below this much SOL moving, a transaction is not treated as a trade (it is rent, a tip or dust). */
export const MIN_SOL_MOVE = 0.001;

/** Below this many dollars of a stablecoin moving, a transaction is not treated as a trade. */
export const MIN_USD_MOVE = 0.1;

/**
 * Gives the trades paid in a stablecoin their SOL amount, at the SOL price when each happened, so everything after this (the positions, the
 * fumble, the totals) works in SOL as before. A trade whose SOL price cannot be found is left out and counted as having no SOL leg.
 */
export async function inSol(trades: Trade[], solUsd: (time: number) => Promise<number | null>, dropped: Dropped): Promise<Trade[]> {
  const out: Trade[] = [];
  for (const t of trades) {
    if (t.usd === undefined) {
      out.push(t);
      continue;
    }
    const price = await solUsd(t.time);
    if (price === null || !(price > 0)) {
      dropped.noSolLeg++;
      continue;
    }
    const { usd, ...rest } = t;
    out.push({ ...rest, sol: usd / price });
  }
  return out;
}

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

    // Stablecoins are the money, not the coin: what the wallet moved of them is the dollar side of a swap.
    let usd = 0;
    for (const m of STABLES) {
      usd += moved.get(m) ?? 0;
      moved.delete(m);
    }

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
    // Paid for, or paid out, in a stablecoin: the SOL is worked out later, once the SOL price at that time is known (see inSol).
    else if (delta < 0 && usd > MIN_USD_MOVE) trades.push({ ...base, side: "sell", sol: 0, usd });
    else if (delta > 0 && usd < -MIN_USD_MOVE) trades.push({ ...base, side: "buy", sol: 0, usd: -usd });
    else dropped.noSolLeg++;
  }

  trades.sort((a, b) => a.time - b.time);
  return { trades, dropped };
}
