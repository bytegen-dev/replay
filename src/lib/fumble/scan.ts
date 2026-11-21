import { fumbleFor, MIN_TRADE_SOL, type Fumble } from "./fumble.ts";
import type { History } from "./helius.ts";
import { matchLots, type SellLot } from "./lots.ts";
import type { PriceSeries } from "./prices.ts";
import { parseTrades } from "./trades.ts";
import type { Dropped, Trade } from "./types.ts";

/**
 * Scans one wallet end to end: history in, trades out, each sell of a meaningful size matched to its buys and given a fumble.
 * The slow, rate-limited parts (history and prices) are passed in as functions, so this logic runs the same on live APIs, on a
 * cache, or on the frozen data the tests use.
 */

export interface ScanDeps {
  history: (wallet: string) => Promise<History>;
  /** A token's candles from `from` to `now`, or null when no provider has them. */
  prices: (mint: string, from: number, now: number) => Promise<PriceSeries | null>;
  /** The SOL price in USD at a time, or null. */
  solUsd: (time: number) => Promise<number | null>;
  now?: () => number;
  /** Asked before each token is priced: true means there is no time left, and the tokens not yet priced are reported unknown. */
  outOfTime?: () => boolean;
  /** Called as the scan moves along, so a page can show progress. */
  onProgress?: (p: ScanProgress) => void;
  /** Called once the history is read and the trades are known, before any price lookups: the trade list can be shown at once. */
  onTrades?: (t: TradeList) => void;
}

/** A wallet's trades of a meaningful size, newest first. */
export interface TradeList {
  history: { transactions: number; pages: number; complete: boolean; oldest: number | null };
  dropped: Dropped;
  /** Every trade found, before the size filter. */
  tradeCount: number;
  trades: Trade[];
}

export interface ScanProgress {
  stage: "history" | "prices" | "done";
  /** Tokens priced so far out of how many need pricing (stage "prices"). */
  done: number;
  total: number;
}

export interface ScannedSell {
  lot: SellLot;
  fumble: Fumble;
  /** Which provider priced it, when one did. */
  source: string | null;
}

export interface ScanResult {
  wallet: string;
  history: { transactions: number; pages: number; complete: boolean; oldest: number | null };
  /** Transactions that were not token-for-SOL trades, by why. */
  dropped: Dropped;
  trades: number;
  /** The buys and sells of at least the minimum size, newest first. */
  tradeList: Trade[];
  /** Sells of at least the minimum size, oldest first, each with its fumble. */
  sells: ScannedSell[];
  /** Sells whose price history could not be found: their fumble is unknown, and they add nothing to the total. */
  unpriced: number;
  /** The sum of the fumbles that could be measured, in dollars. */
  totalFumbleUsd: number;
  /** The biggest single fumble, if any sell was measured. */
  worst: ScannedSell | null;
  /** True when pricing stopped early because time ran out; the sells left unpriced say so. */
  ranOutOfTime: boolean;
}

export async function scanWallet(wallet: string, deps: ScanDeps): Promise<ScanResult> {
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  deps.onProgress?.({ stage: "history", done: 0, total: 0 });
  const history = await deps.history(wallet);
  const { trades, dropped } = parseTrades(wallet, history.txs);
  const lots = matchLots(trades)
    .filter((l) => l.sell.sol >= MIN_TRADE_SOL)
    .sort((a, b) => a.sell.time - b.sell.time);

  // The trade list goes out now, before the slow price lookups.
  const tradeList = trades.filter((t) => t.sol >= MIN_TRADE_SOL).sort((a, b) => b.time - a.time);
  const historySummary = { transactions: history.txs.length, pages: history.pages, complete: history.complete, oldest: history.oldest };
  deps.onTrades?.({ history: historySummary, dropped, tradeCount: trades.length, trades: tradeList });

  // One price lookup per token, from its earliest sale, shared by all its sells. The tokens with the biggest sells go first, so
  // if time runs out it is the small ones that are left unpriced.
  const earliest = new Map<string, number>();
  const biggest = new Map<string, number>();
  for (const l of lots) {
    if (!earliest.has(l.sell.mint) || l.sell.time < earliest.get(l.sell.mint)!) earliest.set(l.sell.mint, l.sell.time);
    biggest.set(l.sell.mint, Math.max(biggest.get(l.sell.mint) ?? 0, l.sell.sol));
  }
  const order = [...earliest.keys()].sort((a, b) => biggest.get(b)! - biggest.get(a)!);
  const series = new Map<string, PriceSeries | null>();
  const timedOut = new Set<string>();
  let done = 0;
  for (const mint of order) {
    deps.onProgress?.({ stage: "prices", done, total: order.length });
    if (deps.outOfTime?.()) timedOut.add(mint);
    else series.set(mint, await deps.prices(mint, earliest.get(mint)!, now));
    done++;
  }

  const sells: ScannedSell[] = [];
  for (const lot of lots) {
    const s = series.get(lot.sell.mint) ?? null;
    const solUsd = s ? await deps.solUsd(lot.sell.time) : null;
    if (timedOut.has(lot.sell.mint)) sells.push({ lot, fumble: { status: "no-price", reason: "ran out of time before this token was priced" }, source: null });
    else if (!s) sells.push({ lot, fumble: { status: "no-price", reason: "no price history for this token" }, source: null });
    else if (solUsd === null) sells.push({ lot, fumble: { status: "no-price", reason: "no SOL price at the time of the sale" }, source: s.source });
    else sells.push({ lot, fumble: fumbleFor(lot.sell, s.candles, { solUsd }), source: s.source });
  }

  let total = 0;
  let worst: ScannedSell | null = null;
  for (const s of sells) {
    if (s.fumble.status !== "ok") continue;
    total += s.fumble.fumbleUsd;
    if (!worst || s.fumble.fumbleUsd > (worst.fumble as { fumbleUsd: number }).fumbleUsd) worst = s;
  }
  deps.onProgress?.({ stage: "done", done: order.length, total: order.length });
  return {
    wallet,
    history: historySummary,
    dropped,
    trades: trades.length,
    tradeList,
    sells,
    unpriced: sells.filter((s) => s.fumble.status !== "ok").length,
    totalFumbleUsd: total,
    worst,
    ranOutOfTime: timedOut.size > 0,
  };
}
