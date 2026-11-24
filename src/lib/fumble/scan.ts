import { fumbleFor, MIN_TRADE_SOL, priceAt, type Fumble } from "./fumble.ts";
import type { History } from "./helius.ts";
import { matchLots, type SellLot } from "./lots.ts";
import { createNameBook, type TokenInfo } from "./tokens.ts";
import { SOL_MINT, type PriceSeries } from "./prices.ts";
import { missedTotals } from "./missed.ts";
import { findPositions, roundTripFor, type Position, type RoundTrip } from "./roundtrip.ts";
import type { SavedWallet, WalletStore } from "./store.ts";
import { inSol, parseTrades, type HeliusTx } from "./trades.ts";
import type { Dropped, Trade, Receive } from "./types.ts";

/**
 * Scans one wallet end to end: history in, trades out, each sell of a meaningful size matched to its buys and given a fumble.
 * The slow, rate-limited parts (history and prices) are passed in as functions, so this logic runs the same on live APIs, on a
 * cache, or on the frozen data the tests use.
 */

export interface ScanDeps {
  /** Reads the wallet's history. `onPage` is called after each page with everything read so far, newest first. */
  history: (wallet: string, onPage?: (txs: HeliusTx[], pages: number) => void, until?: string, before?: string, stopWhen?: (txs: HeliusTx[]) => boolean) => Promise<History>;
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

/** How much of a wallet's history was read. `extendable` is true when it stopped short of the wallet's first transaction and the history is saved, so a later scan can read further back. */
export interface HistorySummary {
  transactions: number;
  pages: number;
  complete: boolean;
  oldest: number | null;
  extendable?: boolean;
}

/** A wallet's trades of a meaningful size, newest first, with the name and ticker of each coin traded where they are known. */
export interface TradeList {
  history: HistorySummary;
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

/** What the scan works out for one coin that needs prices (see ApiCoin in service.ts). `token` is the coin's address. */
export interface ScannedCoin {
  token: string;
  boughtUsd: number | null;
  soldUsd: number | null;
  profitUsd: number | null;
  missedSol: number;
  missedUsd: number;
}

export interface ScanResult {
  wallet: string;
  history: HistorySummary;
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
  /** How many sells had free tokens (received by transfer, or with no buy found), and how much of what they sold for that was, in SOL. Counted as profit in full. */
  freeSells: number;
  freeProceedsSol: number;
  /** The sum of the round-trips that could be measured, in SOL and in dollars. */
  totalRoundTripSol: number;
  totalRoundTripUsd: number;
  /** The total fumble: fumbles and round-trips together without counting a coin twice (see missed.ts), in SOL and in dollars. */
  totalMissedSol: number;
  totalMissedUsd: number;
  /** One entry per coin traded: the dollar value of what was bought and sold, the profit in dollars, and the coin's total fumble. */
  coins: ScannedCoin[];
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
/** Two lists of transfers in as one, by transaction. */
function mergeReceives(older: Receive[], newer: Receive[]): Receive[] {
  const bySig = new Map<string, Receive>();
  for (const r of older) bySig.set(r.signature, r);
  for (const r of newer) bySig.set(r.signature, r);
  return [...bySig.values()].sort((a, b) => a.time - b.time);
}
const addDropped = (a: Dropped, b: Dropped): Dropped => ({ noTokenMove: a.noTokenMove + b.noTokenMove, multiToken: a.multiToken + b.multiToken, noSolLeg: a.noSolLeg + b.noSolLeg });
const NO_DROPS: Dropped = { noTokenMove: 0, multiToken: 0, noSolLeg: 0 };

/** How many trades (of the minimum size) a scan reads before it stops and offers to load more. */
export const TRADES_PER_LOAD = 100;

export interface ScanOptions {
  /** Read further back than the saved history reaches (a wallet whose history was read only part of the way back), instead of reading what is new. */
  more?: boolean;
  /** Stop reading once this many trades of the minimum size have been found (in what is read this time). Default TRADES_PER_LOAD. */
  target?: number;
}

export async function scanWallet(wallet: string, deps: ScanDeps, opts: ScanOptions = {}): Promise<ScanResult> {
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
  // A wallet saved before transfers in were kept has no record of them, and its sells of such tokens would have no cost: its history is read again, once, and
  // the new run replaces the old (below).
  const oldFormat = saved !== null && saved.receives === undefined;
  if (oldFormat) saved = null;
  // Reading further back starts from the oldest saved transaction. With nothing saved, or the whole history already read, it is an ordinary scan.
  const backfill = opts.more === true && saved !== null && !saved.complete && saved.oldestSig !== null;
  const earlier = saved?.trades ?? [];
  const earlierDropped = saved?.dropped ?? NO_DROPS;
  const earlierReceives = saved?.receives ?? [];

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
          deps.onTrades?.({ history: { transactions: read, pages, complete: false, oldest: saved && !backfill ? saved.oldestTime : txs.length ? txs[txs.length - 1].timestamp : (saved?.oldestTime ?? null) }, dropped: droppedSoFar, tradeCount: soFar.length, trades: list, tokens: names.snapshot(), partial: true, pnl: {} });
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
  // A first scan, and reading further back, stop once enough trades are found: a wallet with thousands of trades a month is read a hundred at a time,
  // and the rest is loaded on request. Catching up on what is new since a saved scan reads all of it.
  const target = opts.target ?? TRADES_PER_LOAD;
  // A trade paid in a stablecoin has no SOL amount yet, so about the minimum is taken as 15 dollars, close enough to decide when to stop reading.
  const enough = (txs: HeliusTx[]) => parseTrades(wallet, txs).trades.filter((t) => t.sol >= MIN_TRADE_SOL || (t.usd ?? 0) >= 15).length >= target;
  const history = await deps.history(wallet, emitPartial, backfill ? undefined : (saved?.newestSig ?? undefined), backfill ? (saved!.oldestSig ?? undefined) : undefined, saved === null || backfill ? enough : undefined);
  reading = false;
  const fresh = parseTrades(wallet, history.txs);
  // Trades paid in a stablecoin get their SOL amount now, at the SOL price of the time (and are saved that way).
  fresh.trades = await inSol(fresh.trades, deps.solUsd, fresh.dropped);
  // With saved trades and the newer transactions all read, the two join up. If time ran out before reaching the saved ones there is a gap
  // between them, so only what was just read is used, as on a first scan, and it replaces the saved run (below).
  // Reading further back always joins: it starts exactly where the saved history ends.
  const joined = saved !== null && (backfill || history.complete);
  const trades = joined ? mergeTrades(earlier, fresh.trades) : fresh.trades;
  const dropped = joined ? addDropped(earlierDropped, fresh.dropped) : fresh.dropped;
  const receives = joined ? mergeReceives(earlierReceives, fresh.receives) : fresh.receives;
  let persisted: Promise<void> = Promise.resolve();
  const last = history.txs[history.txs.length - 1];
  let next: SavedWallet | null = null;
  if (deps.store) {
    if (backfill) {
      // Further back: the newest mark stays, the oldest moves back to where reading stopped, and the history is complete once it hits the start.
      if (history.txs.length > 0 || history.complete) {
        next = { trades, receives, newestSig: saved!.newestSig, newestTime: saved!.newestTime, oldestSig: last ? last.signature : saved!.oldestSig, oldestTime: last ? last.timestamp : saved!.oldestTime, complete: history.complete, transactions: saved!.transactions + history.txs.length, dropped };
      }
    } else if (history.txs.length > 0) {
      // Not joined to the saved run (a first scan, or time ran out before reaching it): what was just read becomes the saved run. The older saved
      // trades are let go, so the run stays unbroken and Load more carries on from its oldest end instead of leaving a gap.
      next = joined
        ? { trades, receives, newestSig: history.txs[0].signature, newestTime: history.txs[0].timestamp, oldestSig: saved!.oldestSig, oldestTime: saved!.oldestTime, complete: saved!.complete, transactions: saved!.transactions + history.txs.length, dropped }
        : { trades, receives, newestSig: history.txs[0].signature, newestTime: history.txs[0].timestamp, oldestSig: last.signature, oldestTime: last.timestamp, complete: history.complete, transactions: history.txs.length, dropped };
    }
  }
  if (deps.store && next) {
    const known = new Set(earlier.map((t) => t.signature));
    persisted = deps.store.save(wallet, next, trades.filter((t) => !known.has(t.signature)), (saved !== null && !joined) || oldFormat ? { replace: true } : undefined).catch(() => {
      /* not saving is no reason to fail the scan */
    });
  }
  // Tokens that arrived by transfer have no cost, so they go in as free lots at the time they arrived (see lots.ts), beside the real buys.
  const freeLots: Trade[] = receives.map((r) => ({ side: "buy", mint: r.mint, tokens: r.tokens, sol: 0, time: r.time, signature: r.signature, source: "received" }));
  const lots = matchLots([...trades, ...freeLots])
    .filter((l) => l.sell.sol >= MIN_TRADE_SOL)
    .sort((a, b) => a.sell.time - b.sell.time);

  // The complete trade list goes out now, before the slow price lookups, with each sell's profit, which needs no prices.
  const tradeList = bigEnough(trades);
  const reachedStart = backfill ? history.complete : joined ? saved!.complete : history.complete;
  const historySummary: HistorySummary = {
    transactions: joined ? saved!.transactions + history.txs.length : history.txs.length,
    pages: history.pages,
    complete: reachedStart,
    oldest: backfill ? (last ? last.timestamp : saved!.oldestTime) : joined ? saved!.oldestTime : history.oldest,
    // Only a saved history can be read further.
    ...(deps.store && !reachedStart && (next !== null || saved !== null) ? { extendable: true } : {}),
  };
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
  const solTimes = [...positions.map((p) => p.openedAt), ...lots.map((l) => l.sell.time), ...tradeList.map((t) => t.time)];
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
    // The profit's dollar value uses the SOL price at the sale: the main price series if it had one, and otherwise the one the fumble used (its per-hour
    // fallback), so a missing series does not leave the profit alone in SOL while the fumble has dollars.
    const usdRate = rate ?? solUsd;
    const profitUsd = usdRate ? lot.profitSol * usdRate : null;
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
  const missed = missedTotals(sells, scannedPositions);
  // Each coin's money in dollars, at the SOL price of each trade, and its own share of the total fumble. A dollar value that cannot be worked out
  // (no SOL price for a trade) is null, not a made-up number.
  const coins: ScannedCoin[] = [...new Set(tradeList.map((t) => t.mint))].map((mint) => {
    const own = tradeList.filter((t) => t.mint === mint);
    const usdOf = (side: "buy" | "sell") => {
      let sum = 0;
      for (const t of own) {
        if (t.side !== side) continue;
        const rate = solAt(t.time);
        if (!rate) return null;
        sum += t.sol * rate;
      }
      return sum;
    };
    const mine = sells.filter((x) => x.lot.sell.mint === mint);
    const profits = mine.map((x) => x.profitUsd);
    const m = missedTotals(mine, scannedPositions.filter((p) => p.position.mint === mint));
    return { token: mint, boughtUsd: usdOf("buy"), soldUsd: usdOf("sell"), profitUsd: mine.length && profits.every((v) => v !== null) ? profits.reduce<number>((a, v) => a + (v ?? 0), 0) : null, missedSol: m.sol, missedUsd: m.usd };
  });
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
    freeSells: lots.filter((l) => l.freeTokens > 0).length,
    freeProceedsSol: lots.reduce((sum, l) => sum + (l.sell.sol * l.freeTokens) / l.sell.tokens, 0),
    totalRoundTripSol: totalRoundTrip,
    totalRoundTripUsd,
    totalMissedSol: missed.sol,
    totalMissedUsd: missed.usd,
    coins,
    unpriced: sells.filter((s) => s.fumble.status !== "ok").length,
    totalFumbleUsd: total,
    totalFumbleSol: totalSol,
    worst,
    ranOutOfTime: timedOut.size > 0,
  };
}
