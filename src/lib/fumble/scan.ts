import { fumbleFor, MIN_TRADE_SOL, type Fumble } from "./fumble.ts";
import type { History } from "./helius.ts";
import { matchLots, type SellLot } from "./lots.ts";
import type { PriceSeries } from "./prices.ts";
import { parseTrades } from "./trades.ts";
import type { Dropped } from "./types.ts";

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
  /** Called as the scan moves along, so a page can show progress. */
  onProgress?: (p: ScanProgress) => void;
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
  /** Sells of at least the minimum size, oldest first, each with its fumble. */
  sells: ScannedSell[];
  /** Sells whose price history could not be found: their fumble is unknown, and they add nothing to the total. */
  unpriced: number;
  /** The sum of the fumbles that could be measured, in dollars. */
  totalFumbleUsd: number;
  /** The biggest single fumble, if any sell was measured. */
  worst: ScannedSell | null;
}

export async function scanWallet(wallet: string, deps: ScanDeps): Promise<ScanResult> {
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  deps.onProgress?.({ stage: "history", done: 0, total: 0 });
  const history = await deps.history(wallet);
  const { trades, dropped } = parseTrades(wallet, history.txs);
  const lots = matchLots(trades)
    .filter((l) => l.sell.sol >= MIN_TRADE_SOL)
    .sort((a, b) => a.sell.time - b.sell.time);

  // One price lookup per token, from its earliest sale, shared by all its sells.
  const earliest = new Map<string, number>();
  for (const l of lots) if (!earliest.has(l.sell.mint) || l.sell.time < earliest.get(l.sell.mint)!) earliest.set(l.sell.mint, l.sell.time);
  const series = new Map<string, PriceSeries | null>();
  let done = 0;
  for (const [mint, from] of earliest) {
    deps.onProgress?.({ stage: "prices", done, total: earliest.size });
    series.set(mint, await deps.prices(mint, from, now));
    done++;
  }

  const sells: ScannedSell[] = [];
  for (const lot of lots) {
    const s = series.get(lot.sell.mint) ?? null;
    const solUsd = s ? await deps.solUsd(lot.sell.time) : null;
    if (!s) sells.push({ lot, fumble: { status: "no-price", reason: "no price history for this token" }, source: null });
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
  deps.onProgress?.({ stage: "done", done: earliest.size, total: earliest.size });
  return {
    wallet,
    history: { transactions: history.txs.length, pages: history.pages, complete: history.complete, oldest: history.oldest },
    dropped,
    trades: trades.length,
    sells,
    unpriced: sells.filter((s) => s.fumble.status !== "ok").length,
    totalFumbleUsd: total,
    worst,
  };
}
