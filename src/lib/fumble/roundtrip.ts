import { MIN_TRADE_SOL, priceAt } from "./fumble.ts";
import type { Candle, Trade } from "./types.ts";

/**
 * Round-trips: profit a wallet was sitting on while it held a coin, and then gave back.
 *
 * Follow the wallet's total profit on one coin through the time it held it: what it had already sold for, plus what it still held
 * (at that moment's price), minus what it had put in. The round-trip is the highest that profit ever got, minus the profit kept
 * when the position was closed. Put in 1 SOL, up to 10 SOL at the top (9 SOL of profit), sold at 1.5 SOL (0.5 SOL of profit):
 * 9 - 0.5 = 8.5 SOL round-tripped. Only profit can be given back, so a position that ended at a loss gave back its whole peak profit
 * and no more, and one that never made money gave back nothing.
 *
 * Everything is in SOL, the unit a trader thinks in. The peak is a paper number: it assumes the whole position could have been sold at
 * the highest price in the highest candle, which a thin pool would not have allowed. That is the same limit the fumble has, and
 * it is on purpose.
 *
 * Only positions the wallet's history shows in full count: opened by a buy and closed by selling (nearly) all of it, with every token
 * sold traced to a buy. A sell of tokens bought before the history starts has an unknown cost, so that position is left out.
 */

/** A position counts as closed once what is left is under this share of the tokens ever bought: selling "everything" leaves dust. */
const DUST = 0.005;

export interface Position {
  mint: string;
  trades: Trade[];
  openedAt: number;
  closedAt: number;
  /** The sell that closed it. */
  closedBy: string;
  costSol: number;
  proceedsSol: number;
}

/** The closed, fully traced positions of at least `minCostSol` put in, oldest first. */
export function findPositions(trades: Trade[], minCostSol = MIN_TRADE_SOL): Position[] {
  const byMint = new Map<string, Trade[]>();
  for (const t of trades) byMint.set(t.mint, [...(byMint.get(t.mint) ?? []), t]);

  const out: Position[] = [];
  for (const list of byMint.values()) {
    // Oldest first; a buy and a sell in the same second keep the order they came in, buy first.
    const ordered = list
      .map((t, i) => ({ t, i }))
      .sort((a, b) => a.t.time - b.t.time || (a.t.side === b.t.side ? a.i - b.i : a.t.side === "buy" ? -1 : 1))
      .map((x) => x.t);

    let cur: { trades: Trade[]; balance: number; bought: number; cost: number; proceeds: number; known: boolean } | null = null;
    for (const t of ordered) {
      if (t.side === "buy") {
        cur ??= { trades: [], balance: 0, bought: 0, cost: 0, proceeds: 0, known: true };
        cur.trades.push(t);
        cur.balance += t.tokens;
        cur.bought += t.tokens;
        cur.cost += t.sol;
        continue;
      }
      if (!cur) continue; // a sell with no buy before it: its cost is unknown, and no position is open to belong to
      cur.trades.push(t);
      const matched = Math.min(t.tokens, cur.balance);
      if (t.tokens > cur.balance * (1 + 1e-6) + 1e-9) cur.known = false; // sold more than was bought in the history
      cur.proceeds += (t.sol * matched) / t.tokens;
      cur.balance -= matched;
      if (cur.balance <= cur.bought * DUST) {
        if (cur.known && cur.cost >= minCostSol) out.push({ mint: t.mint, trades: cur.trades, openedAt: cur.trades[0].time, closedAt: t.time, closedBy: t.signature, costSol: cur.cost, proceedsSol: cur.proceeds });
        cur = null;
      }
    }
  }
  return out.sort((a, b) => a.openedAt - b.openedAt);
}

export type RoundTrip =
  | {
      status: "ok";
      /** What was put in, what came back, and the profit kept (all SOL). */
      costSol: number;
      proceedsSol: number;
      finalProfitSol: number;
      /** The most profit the position ever showed, and when. */
      peakProfitSol: number;
      peakAt: number;
      /** The profit given back: the peak profit minus the profit kept (never below zero). Zero when the position only ever rose to where it was closed. */
      roundTripSol: number;
      /** The share of the peak profit that was given back, 0 to 1. Zero when there was never a profit. */
      gaveBack: number;
      heldSeconds: number;
    }
  | { status: "no-price"; reason: string };

/**
 * `candles` are the coin's USD price candles and `solCandles` the SOL price in USD, both covering the hold. The wallet's holdings at
 * each candle's start are valued at that candle's highest price, converted to SOL at that time's SOL price.
 */
export function roundTripFor(pos: Position, candles: Candle[], solCandles: Candle[]): RoundTrip {
  const hold = candles.filter((c) => c.t >= pos.openedAt && c.t <= pos.closedAt && Number.isFinite(c.h) && c.h > 0).sort((a, b) => a.t - b.t);
  if (!hold.length) return { status: "no-price", reason: "no price history during the hold" };
  if (!solCandles.length) return { status: "no-price", reason: "no SOL price during the hold" };

  // The state after each trade, so the holdings at any moment can be read off.
  type State = { time: number; tokens: number; cost: number; proceeds: number };
  const states: State[] = [];
  let tokens = 0;
  let cost = 0;
  let proceeds = 0;
  for (const t of pos.trades) {
    if (t.side === "buy") {
      tokens += t.tokens;
      cost += t.sol;
    } else {
      const matched = Math.min(t.tokens, tokens);
      proceeds += (t.sol * matched) / t.tokens;
      tokens -= matched;
    }
    states.push({ time: t.time, tokens, cost, proceeds });
  }
  const at = (time: number): State => {
    let s: State = { time: 0, tokens: 0, cost: 0, proceeds: 0 };
    for (const x of states) {
      if (x.time <= time) s = x;
      else break;
    }
    return s;
  };

  const final = pos.proceedsSol - pos.costSol;
  let peak = final;
  let peakAt = pos.closedAt;
  // The profit right after each trade, at the price that trade was made at.
  for (let i = 0; i < pos.trades.length; i++) {
    const t = pos.trades[i];
    const s = states[i];
    const profit = s.proceeds - s.cost + (s.tokens * t.sol) / t.tokens;
    if (profit > peak) {
      peak = profit;
      peakAt = t.time;
    }
  }
  // The profit at each candle's high.
  for (const c of hold) {
    const s = at(c.t);
    const sol = priceAt(solCandles, c.t);
    if (!sol || !(sol > 0) || s.tokens <= 0) continue;
    const profit = s.proceeds - s.cost + (s.tokens * c.h) / sol;
    if (profit > peak) {
      peak = profit;
      peakAt = c.t;
    }
  }

  // Only profit can be given back: a position that never made money gave nothing back, and one that ended at a loss gave back all of the
  // profit it had (the loss is a separate fact, the final profit).
  const peakProfit = Math.max(peak, 0);
  const roundTrip = Math.max(0, peakProfit - Math.max(final, 0));
  return {
    status: "ok",
    costSol: pos.costSol,
    proceedsSol: pos.proceedsSol,
    finalProfitSol: final,
    peakProfitSol: peak,
    peakAt,
    roundTripSol: roundTrip,
    gaveBack: peak > 0 ? roundTrip / peak : 0,
    heldSeconds: pos.closedAt - pos.openedAt,
  };
}
