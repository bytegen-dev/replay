import type { ScanProgress, ScanResult, ScannedPosition, ScannedSell, TradeList } from "./scan.ts";
import type { Trade } from "./types.ts";

/**
 * What the API sends back, and the guard rails around running a scan: a short-lived cache of finished scans, one shared run when
 * several people ask for the same wallet at once, and a cap on how many scans run at the same time. All of it takes its scan
 * function and clock as arguments, so it is tested without any network.
 */

/** One sell, in the shape the page needs. Times are seconds since 1970; money is USD unless the name says SOL. */
export interface ApiSell {
  signature: string;
  token: string;
  soldAt: number;
  tokens: number;
  soldSol: number;
  /** How many of the tokens sold had a known buy, and what those cost (SOL). Cost is only known for the matched part. */
  matchedTokens: number;
  costSol: number;
  profitSol: number;
  /** "ok" when the fumble was measured, "unknown" when no price history could be found (the fumble is not zero, it is not known). */
  status: "ok" | "unknown";
  reason?: string;
  soldUsd?: number;
  peakAt?: number;
  peakMultiple?: number;
  fumbleUsd?: number;
  /** Which price source measured it. */
  source?: string | null;
}

/** One trade, in the shape the page needs. Times are seconds since 1970. */
export interface ApiTrade {
  signature: string;
  side: "buy" | "sell";
  token: string;
  tokens: number;
  sol: number;
  time: number;
  /** The router or exchange the history provider named. */
  source?: string;
}

/** What is known about the wallet's trades as soon as its history is read, before any price lookups. */
export interface ApiTrades {
  wallet: string;
  /** How much of the wallet's history was read. When `complete` is false only the newest part was, back to `oldest`. */
  coverage: { transactions: number; pages: number; complete: boolean; oldest: number | null };
  /** Token-for-SOL trades found, of any size. */
  tradeCount: number;
  /** Transactions left out because they were not a token-for-SOL swap, by why. */
  ignored: { noTokenMove: number; multiToken: number; noSolLeg: number };
  /** The trades of at least the minimum size, newest first. */
  trades: ApiTrade[];
}

const toApiTrade = (t: Trade): ApiTrade => ({ signature: t.signature, side: t.side, token: t.mint, tokens: t.tokens, sol: t.sol, time: t.time, ...(t.source ? { source: t.source } : {}) });

export function toApiTrades(wallet: string, t: TradeList): ApiTrades {
  return { wallet, coverage: t.history, tradeCount: t.tradeCount, ignored: t.dropped, trades: t.trades.map(toApiTrade) };
}

/** What a scan sends while it runs: progress, and once the history is read the trade list. */
export type ScanEvent = ({ type: "progress" } & ScanProgress) | { type: "trades"; data: ApiTrades };

/** One closed position: a coin bought and then sold out of, with the profit it gave back. Money is SOL; times are seconds since 1970. */
export interface ApiPosition {
  token: string;
  openedAt: number;
  closedAt: number;
  /** The sell that closed it (the signature of a trade in the list), so the page can show the result on that row. */
  closedBy: string;
  costSol: number;
  proceedsSol: number;
  status: "ok" | "unknown";
  reason?: string;
  /** The profit kept, the most it ever showed, and when. */
  finalProfitSol?: number;
  peakProfitSol?: number;
  peakAt?: number;
  /** The profit given back, and the share of the peak profit that was (0 to 1). */
  roundTripSol?: number;
  gaveBack?: number;
  source?: string | null;
}

export function toApiPosition(p: ScannedPosition): ApiPosition {
  const { position: pos, roundTrip: rt } = p;
  const base = { token: pos.mint, openedAt: pos.openedAt, closedAt: pos.closedAt, closedBy: pos.closedBy, costSol: pos.costSol, proceedsSol: pos.proceedsSol };
  if (rt.status !== "ok") return { ...base, status: "unknown", reason: rt.reason };
  return { ...base, status: "ok", finalProfitSol: rt.finalProfitSol, peakProfitSol: rt.peakProfitSol, peakAt: rt.peakAt, roundTripSol: rt.roundTripSol, gaveBack: rt.gaveBack, source: p.source };
}

export interface ApiResult extends ApiTrades {
  scannedAt: number;
  /** The sells with their fumbles. Measured sells first, biggest fumble first; then the ones with no price history, oldest first. */
  sells: ApiSell[];
  measured: number;
  unknown: number;
  totalFumbleUsd: number;
  /** The closed positions: measured ones first, biggest round-trip first, then the ones with no price history, oldest first. */
  positions: ApiPosition[];
  totalRoundTripSol: number;
  ranOutOfTime: boolean;
}

export function toApiSell(s: ScannedSell): ApiSell {
  const { lot, fumble } = s;
  const base = {
    signature: lot.sell.signature,
    token: lot.sell.mint,
    soldAt: lot.sell.time,
    tokens: lot.sell.tokens,
    soldSol: lot.sell.sol,
    matchedTokens: lot.matchedTokens,
    costSol: lot.costSol,
    profitSol: lot.profitSol,
  };
  if (fumble.status !== "ok") return { ...base, status: "unknown", reason: fumble.reason };
  return { ...base, status: "ok", soldUsd: fumble.soldUsd, peakAt: fumble.peakAt, peakMultiple: fumble.peakMultiple, fumbleUsd: fumble.fumbleUsd, source: s.source };
}

function orderPositions(all: ApiPosition[]): ApiPosition[] {
  const measured = all.filter((p) => p.status === "ok").sort((a, b) => b.roundTripSol! - a.roundTripSol!);
  const unknown = all.filter((p) => p.status === "unknown").sort((a, b) => a.openedAt - b.openedAt);
  return [...measured, ...unknown];
}

export function toApiResult(r: ScanResult, scannedAt: number): ApiResult {
  const all = r.sells.map(toApiSell);
  const measured = all.filter((s) => s.status === "ok").sort((a, b) => b.fumbleUsd! - a.fumbleUsd!);
  const unknown = all.filter((s) => s.status === "unknown").sort((a, b) => a.soldAt - b.soldAt);
  return {
    wallet: r.wallet,
    scannedAt,
    coverage: r.history,
    tradeCount: r.trades,
    ignored: r.dropped,
    trades: r.tradeList.map(toApiTrade),
    sells: [...measured, ...unknown],
    measured: measured.length,
    unknown: unknown.length,
    totalFumbleUsd: r.totalFumbleUsd,
    positions: orderPositions(r.positions.map(toApiPosition)),
    totalRoundTripSol: r.totalRoundTripSol,
    ranOutOfTime: r.ranOutOfTime,
  };
}

/** Thrown when too many scans are already running. The caller should tell the person to try again shortly. */
export class BusyError extends Error {
  constructor() {
    super("too many scans are running");
  }
}

export interface ScannerOptions {
  run: (wallet: string, emit: (e: ScanEvent) => void) => Promise<ScanResult>;
  /** Seconds since 1970. */
  now?: () => number;
  /** How long a finished scan is reused, in seconds. Default 20 minutes. */
  ttlSeconds?: number;
  /** Most scans running at once. Default 3. */
  maxActive?: number;
  /** Most finished scans kept. Default 200. */
  maxCached?: number;
}

export function createScanner(opts: ScannerOptions) {
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const ttl = opts.ttlSeconds ?? 20 * 60;
  const maxActive = opts.maxActive ?? 3;
  const maxCached = opts.maxCached ?? 200;
  const cache = new Map<string, ApiResult>();
  const running = new Map<string, { promise: Promise<ApiResult>; listeners: Set<(e: ScanEvent) => void>; trades: ScanEvent | null }>();

  /** A finished scan of this wallet, if one is fresh enough. */
  function peek(wallet: string): ApiResult | null {
    const hit = cache.get(wallet);
    if (!hit) return null;
    if (now() - hit.scannedAt > ttl) {
      cache.delete(wallet);
      return null;
    }
    return hit;
  }

  /**
   * Scans a wallet, or returns the fresh scan already done, or joins the one already running for it (and so also gets its events,
   * including the trade list if that was already sent). `cached` says whether the result came from a previous scan.
   */
  async function scan(wallet: string, onEvent?: (e: ScanEvent) => void): Promise<{ result: ApiResult; cached: boolean }> {
    const hit = peek(wallet);
    if (hit) return { result: hit, cached: true };

    const joined = running.get(wallet);
    if (joined) {
      if (onEvent) {
        if (joined.trades) onEvent(joined.trades);
        joined.listeners.add(onEvent);
      }
      return { result: await joined.promise, cached: false };
    }
    if (running.size >= maxActive) throw new BusyError();

    const listeners = new Set<(e: ScanEvent) => void>();
    if (onEvent) listeners.add(onEvent);
    const entry = { promise: null as unknown as Promise<ApiResult>, listeners, trades: null as ScanEvent | null };
    const emit = (e: ScanEvent) => {
      if (e.type === "trades") entry.trades = e;
      listeners.forEach((l) => l(e));
    };
    entry.promise = (async () => {
      try {
        const raw = await opts.run(wallet, emit);
        const result = toApiResult(raw, now());
        cache.set(wallet, result);
        if (cache.size > maxCached) cache.delete(cache.keys().next().value as string); // the oldest entry goes first
        return result;
      } finally {
        running.delete(wallet);
      }
    })();
    running.set(wallet, entry);
    return { result: await entry.promise, cached: false };
  }

  return { scan, peek, active: () => running.size };
}
