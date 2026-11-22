import { fumbleFor, MIN_TRADE_SOL, priceAt, type Fumble } from "./fumble.ts";
import type { History } from "./helius.ts";
import { matchLots, type SellLot } from "./lots.ts";
import { createNameBook, type TokenInfo } from "./tokens.ts";
import { SOL_MINT, type PriceSeries } from "./prices.ts";
import { findPositions, roundTripFor, type Position, type RoundTrip } from "./roundtrip.ts";
import type { SavedWallet, WalletStore } from "./store.ts";
import { parseTrades, type HeliusTx } from "./trades.ts";
import type { Dropped, Trade } from "./types.ts";

/**
 * Scans one wallet end to end: history in, trades out, each sell of a meaningful size matched to its buys and given a fumble.
 * The slow, rate-limited parts (history and prices) are passed in as functions, so this logic runs the same on live APIs, on a
 * cache, or on the frozen data the tests use.
 */

export interface ScanDeps {
  /** Reads the wallet's history. `onPage` is called after each page with everything read so far, newest first. */
  history: (wallet: string, onPage?: (txs: HeliusTx[], pages: number) => void, until?: string) => Promise<History>;
  /**
   * Where a wallet's trades are saved between scans. With it, a rescan shows the saved trades at once and reads only the transactions newer
   * than the newest saved one (`until` in `history`). Without it, or when it fails, every scan reads the history from scratch.
   */
  store?: WalletStore;
  /** A token's candles from `from` to `now`, or null when no provider has them. */
  prices: (mint: string, from: number, now: number) => Promise<PriceSeries | null>;
  /** The SOL price in USD at a time, or null. */
  solUsd: (time: number) => Promise<number | null>;
  now?: () => number;
  /** Asked before each token is priced: true means there is no time left, and the tokens not yet priced are reported unknown. */
  outOfTime?: () => boolean;
  /** Names and tickers for a list of coins. Optional, and a failure is fine: the trade list is shown with addresses instead. */
  tokens?: (mints: string[]) => Promise<Map<string, TokenInfo>>;
  /** Called as the scan moves along, so a page can show progress. */
  onProgress?: (p: ScanProgress) => void;
  /** Called with the trade list as it is known: first while the history is still being read (`partial`, growing with each page), then once it is complete, before any price lookups. */
  onTrades?: (t: TradeList) => void;
}

/** A wallet's trades of a meaningful size, newest first, with the name and ticker of each coin traded where they are known. */
export interface TradeList {
  history: { transactions: number; pages: number; complete: boolean; oldest: number | null };
  dropped: Dropped;
  /** Every trade found, before the size filter. */
  tradeCount: number;
  trades: Trade[];
  tokens: Record<string, TokenInfo>;
  /** True while the history is still being read: more trades are coming, and the profit on a sell cannot be told yet (its buys may be on a page not read). */
  partial: boolean;
  /** For each sell in the list, by transaction: the profit traced to its buys, in SOL. Only once the history is complete, and it needs no prices. */
  pnl: Record<string, { profitSol: number; matchedTokens: number }>;
}

export interface ScanProgress {
  stage: "history" | "prices" | "done";
  /** Transactions read so far (stage "history"), or tokens priced so far out of how many need pricing (stage "prices"). */
  done: number;
  total: number;
}

export interface ScannedSell {
  lot: SellLot;
  fumble: Fumble;
  /** The profit on this sell in dollars (its SOL profit at the SOL price of the sale), or null when no SOL price was found. Only the part of the sell traced to buys counts. */
  profitUsd: number | null;
  /** Which provider priced it, when one did. */
  source: string | null;
}

export interface ScannedPosition {
  position: Position;
  roundTrip: RoundTrip;
  /** Which provider priced the coin, when one did. */
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
  /** The name and ticker of each coin in the trade list, where known. */
  tokens: Record<string, TokenInfo>;
  /** Sells of at least the minimum size, oldest first, each with its fumble. */
  sells: ScannedSell[];
  /** Sells whose price history could not be found: their fumble is unknown, and they add nothing to the total. */
  unpriced: number;
  /** The sum of the fumbles that could be measured, in dollars and in SOL (each at the SOL price of its own sale). */
  totalFumbleUsd: number;
  totalFumbleSol: number;
  /** The biggest single fumble, if any sell was measured. */
  worst: ScannedSell | null;
  /** Closed positions, each with the profit it gave back, oldest first. */
  positions: ScannedPosition[];
  /** The wallet's realized profit: every scanned sell's proceeds minus what those coins cost, in SOL and in dollars. Only the part of each sell traced to buys counts. */
  totalProfitSol: number;
  totalProfitUsd: number;
  /** Sells that included coins bought before the history starts, so their profit covers only part of the sale. */
  partialSells: number;
  /** The sum of the round-trips that could be measured, in SOL and in dollars. */
  totalRoundTripSol: number;
  totalRoundTripUsd: number;
  /** True when pricing stopped early because time ran out; the sells left unpriced say so. */
  ranOutOfTime: boolean;
}

/** Two trade lists as one, by transaction. Where both have a trade the second wins. */
function mergeTrades(older: Trade[], newer: Trade[]): Trade[] {
  const bySig = new Map<string, Trade>();
  for (const t of older) bySig.set(t.signature, t);
  for (const t of newer) bySig.set(t.signature, t);
  return [...bySig.values()];
}
const addDropped = (a: Dropped, b: Dropped): Dropped => ({ noTokenMove: a.noTokenMove + b.noTokenMove, multiToken: a.multiToken + b.multiToken, noSolLeg: a.noSolLeg + b.noSolLeg });
const NO_DROPS: Dropped = { noTokenMove: 0, multiToken: 0, noSolLeg: 0 };

export async function scanWallet(wallet: string, deps: ScanDeps): Promise<ScanResult> {
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  deps.onProgress?.({ stage: "history", done: 0, total: 0 });
  const names = createNameBook(deps.tokens);
  const bigEnough = (list: Trade[]) => list.filter((t) => t.sol >= MIN_TRADE_SOL).sort((a, b) => b.time - a.time);

  // What an earlier scan saved. A failure to read it is no reason to fail the scan: it just starts from scratch.
  let saved: SavedWallet | null = null;
  if (deps.store) {
    try {
      saved = await deps.store.load(wallet);
    } catch {
      saved = null;
    }
    if (saved && !saved.newestSig) saved = null;
  }
  const earlier = saved?.trades ?? [];
  const earlierDropped = saved?.dropped ?? NO_DROPS;

  // While the history is still being read, each page puts the trades found so far on the page: the list grows, and the names of new coins
  // follow a moment later. Nothing about profit is said yet, because the buys behind an old sell may be on a page not read.
  let reading = true;
  const emitPartial = deps.onTrades
    ? (txs: HeliusTx[], pages: number) => {
        deps.onProgress?.({ stage: "history", done: txs.length, total: 0 });
        const { trades: fresh, dropped: freshDropped } = parseTrades(wallet, txs);
        const soFar = saved ? mergeTrades(earlier, fresh) : fresh;
        const droppedSoFar = saved ? addDropped(earlierDropped, freshDropped) : freshDropped;
        const list = bigEnough(soFar);
        const send = () => {
          if (!reading) return;
          const read = txs.length + (saved?.transactions ?? 0);
          deps.onTrades?.({ history: { transactions: read, pages, complete: false, oldest: saved ? saved.oldestTime : txs.length ? txs[txs.length - 1].timestamp : null }, dropped: droppedSoFar, tradeCount: soFar.length, trades: list, tokens: names.snapshot(), partial: true, pnl: {} });
        };
        send();
        void names.ensure(list.map((t) => t.mint)).then((learned) => learned && send());
      }
    : undefined;
  // Saved trades show at once, while the newer transactions are read.
  if (saved && deps.onTrades) {
    const list = bigEnough(earlier);
    const show = () => reading && deps.onTrades?.({ history: { transactions: saved!.transactions, pages: 0, complete: false, oldest: saved!.oldestTime }, dropped: earlierDropped, tradeCount: earlier.length, trades: list, tokens: names.snapshot(), partial: true, pnl: {} });
    show();
    void names.ensure(list.map((t) => t.mint)).then((learned) => learned && show());
  }
  const history = await deps.history(wallet, emitPartial, saved?.newestSig ?? undefined);
  reading = false;
  const fresh = parseTrades(wallet, history.txs);
  // With saved trades and the newer transactions all read, the two join up. If time ran out before reaching the saved ones there is a gap
  // between them, so only what was just read is used, as on a first scan, and the saved state is left as it was.
  const joined = saved !== null && history.complete;
  const trades = joined ? mergeTrades(earlier, fresh.trades) : fresh.trades;
  const dropped = joined ? addDropped(earlierDropped, fresh.dropped) : fresh.dropped;
  let persisted: Promise<void> = Promise.resolve();
  if (deps.store && history.txs.length > 0 && (joined || saved === null)) {
    const next: SavedWallet = joined
      ? { trades, newestSig: history.txs[0].signature, newestTime: history.txs[0].timestamp, oldestSig: saved!.oldestSig, oldestTime: saved!.oldestTime, complete: saved!.complete, transactions: saved!.transactions + history.txs.length, dropped }
      : { trades, newestSig: history.txs[0].signature, newestTime: history.txs[0].timestamp, oldestSig: history.txs[history.txs.length - 1].signature, oldestTime: history.txs[history.txs.length - 1].timestamp, complete: history.complete, transactions: history.txs.length, dropped };
    const known = new Set(earlier.map((t) => t.signature));
    persisted = deps.store.save(wallet, next, trades.filter((t) => !known.has(t.signature))).catch(() => {
      /* not saving is no reason to fail the scan */
    });
  }
  const lots = matchLots(trades)
    .filter((l) => l.sell.sol >= MIN_TRADE_SOL)
    .sort((a, b) => a.sell.time - b.sell.time);

  // The complete trade list goes out now, before the slow price lookups, with each sell's profit, which needs no prices.
  const tradeList = bigEnough(trades);
  const historySummary = joined
    ? { transactions: saved!.transactions + history.txs.length, pages: history.pages, complete: saved!.complete, oldest: saved!.oldestTime }
    : { transactions: history.txs.length, pages: history.pages, complete: history.complete, oldest: history.oldest };
  const pnl = Object.fromEntries(lots.map((l) => [l.sell.signature, { profitSol: l.profitSol, matchedTokens: l.matchedTokens }]));
  // The names of any coins not looked up yet are fetched while the prices are, and the list goes out as soon as they are in, so it never
  // waits on the slow part. With no name lookup there is nothing to wait for and the list goes out at once.
  const sendList = (tokens: Record<string, TokenInfo>) => deps.onTrades?.({ history: historySummary, dropped, tradeCount: trades.length, trades: tradeList, tokens, partial: false, pnl });
  const mints = [...new Set(tradeList.map((t) => t.mint))];
  let listSent: Promise<Record<string, TokenInfo>>;
  if (deps.tokens && mints.length) {
    listSent = names
      .ensure(mints)
      .then(() => names.snapshot())
      .then((tokens) => (sendList(tokens), tokens));
  } else {
    sendList({});
    listSent = Promise.resolve({});
  }

  // One price lookup per token, from its earliest sale or the buy that opened a position in it, shared by everything about that token: the
  // fumbles of its sells and the round-trips of its positions. The tokens with the most money in them go first, so if time runs out it is
  // the small ones that are left unpriced.
  const positions = findPositions(trades);
  const earliest = new Map<string, number>();
  const biggest = new Map<string, number>();
  const need = (mint: string, from: number, size: number) => {
    if (!earliest.has(mint) || from < earliest.get(mint)!) earliest.set(mint, from);
    biggest.set(mint, Math.max(biggest.get(mint) ?? 0, size));
  };
  for (const l of lots) need(l.sell.mint, l.sell.time, l.sell.sol);
  for (const p of positions) need(p.mint, p.openedAt, p.costSol);
  const order = [...earliest.keys()].sort((a, b) => biggest.get(b)! - biggest.get(a)!);
  const series = new Map<string, PriceSeries | null>();
  const timedOut = new Set<string>();
  // The SOL price through every position and sale, in one lookup, so holdings can be valued in SOL and profits in dollars.
  const solTimes = [...positions.map((p) => p.openedAt), ...lots.map((l) => l.sell.time)];
  const solSeries = solTimes.length && !deps.outOfTime?.() ? await deps.prices(SOL_MINT, Math.min(...solTimes), now) : null;
  const solAt = (time: number) => (solSeries ? priceAt(solSeries.candles, time) : null);
  let done = 0;
  for (const mint of order) {
    deps.onProgress?.({ stage: "prices", done, total: order.length });
    if (deps.outOfTime?.()) timedOut.add(mint);
    else series.set(mint, await deps.prices(mint, earliest.get(mint)!, now));
    done++;
  }

  const tokens = await listSent;
  const sells: ScannedSell[] = [];
  for (const lot of lots) {
    const s = series.get(lot.sell.mint) ?? null;
    const rate = solAt(lot.sell.time);
    // The SOL price series fetched once for the whole scan answers this; asking for the sale's own hour is only the fallback, because each
    // of those is a price call and the free tiers allow about one a second.
    const solUsd = s ? (rate ?? (await deps.solUsd(lot.sell.time))) : null;
    const profitUsd = rate ? lot.profitSol * rate : null;
    if (timedOut.has(lot.sell.mint)) sells.push({ lot, profitUsd, fumble: { status: "no-price", reason: "ran out of time before this token was priced" }, source: null });
    else if (!s) sells.push({ lot, profitUsd, fumble: { status: "no-price", reason: "no price history for this token" }, source: null });
    else if (solUsd === null) sells.push({ lot, profitUsd, fumble: { status: "no-price", reason: "no SOL price at the time of the sale" }, source: s.source });
    else sells.push({ lot, profitUsd, fumble: fumbleFor(lot.sell, s.candles, { solUsd }), source: s.source });
  }
  let totalProfitSol = 0;
  let totalProfitUsd = 0;
  for (const x of sells) {
    totalProfitSol += x.lot.profitSol;
    totalProfitUsd += x.profitUsd ?? 0;
  }

  const scannedPositions: ScannedPosition[] = positions.map((position) => {
    const s = series.get(position.mint) ?? null;
    if (timedOut.has(position.mint)) return { position, roundTrip: { status: "no-price", reason: "ran out of time before this token was priced" }, source: null };
    if (!s) return { position, roundTrip: { status: "no-price", reason: "no price history for this token" }, source: null };
    return { position, roundTrip: roundTripFor(position, s.candles, solSeries?.candles ?? []), source: s.source };
  });
  let totalRoundTrip = 0;
  let totalRoundTripUsd = 0;
  for (const p of scannedPositions) {
    if (p.roundTrip.status !== "ok") continue;
    totalRoundTrip += p.roundTrip.roundTripSol;
    totalRoundTripUsd += p.roundTrip.roundTripUsd;
  }

  let total = 0;
  let totalSol = 0;
  let worst: ScannedSell | null = null;
  for (const s of sells) {
    if (s.fumble.status !== "ok") continue;
    total += s.fumble.fumbleUsd;
    totalSol += s.fumble.fumbleSol;
    if (!worst || s.fumble.fumbleUsd > (worst.fumble as { fumbleUsd: number }).fumbleUsd) worst = s;
  }
  await persisted;
  deps.onProgress?.({ stage: "done", done: order.length, total: order.length });
  return {
    wallet,
    history: historySummary,
    dropped,
    trades: trades.length,
    tradeList,
    tokens,
    sells,
    positions: scannedPositions,
    totalProfitSol,
    totalProfitUsd,
    partialSells: lots.filter((l) => l.unmatchedTokens > 0).length,
    totalRoundTripSol: totalRoundTrip,
    totalRoundTripUsd,
    unpriced: sells.filter((s) => s.fumble.status !== "ok").length,
    totalFumbleUsd: total,
    totalFumbleSol: totalSol,
    worst,
    ranOutOfTime: timedOut.size > 0,
  };
}
