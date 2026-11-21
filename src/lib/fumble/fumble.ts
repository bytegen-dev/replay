import type { Candle, Trade } from "./types.ts";

/**
 * The fumble: what a sell left on the table. The tokens sold, times how much higher the price went afterwards than the price
 * they were sold at, only when it did go higher.
 *
 * Everything is in dollars: the sale's SOL is converted at the SOL price of that moment, and the candles are the token's own
 * dollar price. Dollars are used because many memecoins have no pool against SOL (they trade against another token), and the
 * dollar price is the one number every pool can give.
 *
 * Choices that make the number defensible, not generous:
 *  - Only candles that start after the sale count. The candle the sale happened in is left out, so the sale's own wick cannot
 *    inflate the result.
 *  - The headline uses the highest price reached (the all-time high after the sale). The highest close is returned as well, as
 *    a steadier figure, and `minCandleVolumeUsd` can ignore candles too thin to trust.
 *  - The sale price is what the wallet actually received, not the chart price, so slippage counts as part of the sale.
 */

/** Sells smaller than this many SOL are not scored: the leaderboard is memecoins at a meaningful size. */
export const MIN_TRADE_SOL = 0.1;

export interface FumbleOptions {
  /** The SOL price in USD at the time of the sale. */
  solUsd: number;
  /** Ignore candles whose volume (USD) is below this. Candles with no volume figure are kept. Default 0: use every candle. */
  minCandleVolumeUsd?: number;
}

export type Fumble =
  | {
      status: "ok";
      /** What the tokens sold for, in USD per token and in total. */
      soldUsdPerToken: number;
      soldUsd: number;
      /** The highest price after the sale, when it came (the start of that candle), and how many times the sale price it was. */
      peakHigh: number;
      peakAt: number;
      peakMultiple: number;
      /** The highest close after the sale. */
      peakClose: number;
      /** The price in the latest candle, and its multiple of the sale price. */
      latest: number;
      latestMultiple: number;
      /** Dollars left on the table, against the highest price and against the highest close. Zero when the price never went higher. */
      fumbleUsd: number;
      fumbleUsdClose: number;
      /** The headline figure in SOL, at the SOL price of the sale. */
      fumbleSol: number;
      /** What the tokens would have been worth at the highest price. */
      peakValueUsd: number;
    }
  /** No price history after the sale (a token that died, or has no pool). The fumble is unknown, not zero. */
  | { status: "no-price"; reason: string };

export function fumbleFor(sell: Trade, candles: Candle[], opts: FumbleOptions): Fumble {
  if (sell.side !== "sell") return { status: "no-price", reason: "not a sell" };
  if (!(opts.solUsd > 0) || !(sell.tokens > 0) || !(sell.sol > 0)) return { status: "no-price", reason: "no sale price" };
  const min = opts.minCandleVolumeUsd ?? 0;
  const after = candles.filter((c) => c.t > sell.time && Number.isFinite(c.h) && c.h > 0 && (c.v === undefined || c.v >= min)).sort((a, b) => a.t - b.t);
  if (!after.length) return { status: "no-price", reason: "no price history after the sale" };

  const soldUsd = sell.sol * opts.solUsd;
  const soldUsdPerToken = soldUsd / sell.tokens;
  let peak = after[0];
  let peakClose = after[0].c;
  for (const c of after) {
    if (c.h > peak.h) peak = c;
    if (c.c > peakClose) peakClose = c.c;
  }
  const latest = after[after.length - 1].c;
  const fumbleUsd = Math.max(0, sell.tokens * (peak.h - soldUsdPerToken));
  return {
    status: "ok",
    soldUsdPerToken,
    soldUsd,
    peakHigh: peak.h,
    peakAt: peak.t,
    peakMultiple: peak.h / soldUsdPerToken,
    peakClose,
    latest,
    latestMultiple: latest / soldUsdPerToken,
    fumbleUsd,
    fumbleUsdClose: Math.max(0, sell.tokens * (peakClose - soldUsdPerToken)),
    fumbleSol: fumbleUsd / opts.solUsd,
    peakValueUsd: sell.tokens * peak.h,
  };
}

/** The price in the candle that contains `time`, else the nearest candle before it, else the nearest after. Null with no candles. Used for the SOL price at a sale. */
export function priceAt(candles: Candle[], time: number): number | null {
  if (!candles.length) return null;
  const sorted = [...candles].sort((a, b) => a.t - b.t);
  let best = sorted[0];
  for (const c of sorted) {
    if (c.t <= time) best = c;
    else break;
  }
  return best.c;
}

/** The sells worth scoring: big enough, in order. */
export function significantSells(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.side === "sell" && t.sol >= MIN_TRADE_SOL).sort((a, b) => a.time - b.time);
}
