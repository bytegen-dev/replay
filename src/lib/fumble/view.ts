import { isWalletAddress } from "./helius.ts";
import type { TokenInfo } from "./tokens.ts";
import type { ApiPosition, ApiResult, ApiSell, ApiTrade, ScanEvent } from "./service.ts";

/**
 * What the Fumble page needs that is not drawing: reading the scan's stream, putting each trade next to its fumble, and writing
 * the numbers. Pure, so it is tested without a browser.
 */

/** Everything the route can send: the scan's own events, the finished result, or a failure. */
export type StreamEvent = ScanEvent | { type: "result"; cached: boolean; data: ApiResult } | { type: "error"; message: string };

/**
 * Reads newline-separated JSON events out of chunks of text that can end anywhere, even mid-line or mid-character. A line that is not
 * valid JSON is skipped, not fatal: one garbled event should not end a scan the server is still running.
 */
export function makeEventReader(onEvent: (e: StreamEvent) => void) {
  let rest = "";
  const emit = (line: string) => {
    if (!line.trim()) return;
    try {
      const e = JSON.parse(line) as { type?: unknown };
      if (typeof e?.type === "string") onEvent(e as StreamEvent);
    } catch {
      /* a broken line */
    }
  };
  return {
    push(text: string) {
      rest += text;
      let i: number;
      while ((i = rest.indexOf("\n")) >= 0) {
        emit(rest.slice(0, i));
        rest = rest.slice(i + 1);
      }
    },
    /** The stream is over: whatever is left is the last line. */
    end() {
      emit(rest);
      rest = "";
    },
  };
}

export interface Row {
  trade: ApiTrade;
  /** The sell's fumble, once the scan has priced it. Null for buys, and for sells not priced yet. */
  sell: ApiSell | null;
  /** The position this sell closed, once the scan has finished. Null for every other trade. */
  position: ApiPosition | null;
}

/** The trades, in the order given, each with its sell result and the position it closed, when there are any (matched by transaction). */
export function buildRows(trades: ApiTrade[], sells: ApiSell[] | null, positions: ApiPosition[] | null = null): Row[] {
  const bySignature = new Map((sells ?? []).map((s) => [s.signature, s]));
  const closing = new Map((positions ?? []).map((p) => [p.closedBy, p]));
  return trades.map((trade) => ({ trade, sell: trade.side === "sell" ? (bySignature.get(trade.signature) ?? null) : null, position: closing.get(trade.signature) ?? null }));
}

/** A token address shortened to its ends: 9msk…pump. */
export function shortMint(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;
}

/** Whole dollars from $100 up, cents below. */
export function usd(x: number): string {
  const big = Math.abs(x) >= 100;
  return x.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: big ? 0 : 2, maximumFractionDigits: big ? 0 : 2 });
}

/** How many times the sale price the price got to: 1.17x under two, 8.1x under ten, 12x from ten up. */
export function times(x: number): string {
  return `${x >= 10 ? Math.round(x) : x.toFixed(x < 2 ? 2 : 1)}x`;
}

/** What the fumble column says for a row. */
export type FumbleCell =
  | { kind: "none" } // a buy: nothing to fumble
  | { kind: "pricing" } // a sell the scan has not priced yet
  | { kind: "fumbled"; usd: number; sol: number; peakMultiple: number }
  | { kind: "sold-well" } // the price never went meaningfully higher
  | { kind: "unknown"; reason: string };

/** Under this many dollars a fumble is rounding, not a miss. */
export const MIN_FUMBLE_USD = 1;

export function fumbleCell(row: Row, scanDone: boolean): FumbleCell {
  if (row.trade.side === "buy") return { kind: "none" };
  const s = row.sell;
  if (!s) return scanDone ? { kind: "unknown", reason: "This sale was not priced." } : { kind: "pricing" };
  if (s.status === "unknown") return { kind: "unknown", reason: s.reason ?? "No price history." };
  if ((s.fumbleUsd ?? 0) < MIN_FUMBLE_USD) return { kind: "sold-well" };
  return { kind: "fumbled", usd: s.fumbleUsd!, sol: s.fumbleSol ?? 0, peakMultiple: s.peakMultiple! };
}

/** What the PnL column says for a row: the profit on a sell, from the buys it was traced to. */
export type PnlCell =
  | { kind: "none" } // a buy
  | { kind: "pending" } // a sell the scan has not reached yet
  | { kind: "unknown" } // none of the coins sold were bought in the part of the history that was read, so the cost is not known
  | { kind: "profit"; usd: number | null; sol: number; partial: boolean }; // partial: part of the sale could not be traced to a buy

export function pnlCell(row: Row, scanDone: boolean, early: Record<string, { profitSol: number; matchedTokens: number }> = {}): PnlCell {
  if (row.trade.side === "buy") return { kind: "none" };
  const s = row.sell;
  if (s) {
    if (s.matchedTokens <= 0) return { kind: "unknown" };
    return { kind: "profit", usd: s.profitUsd ?? null, sol: s.profitSol, partial: s.matchedTokens < s.tokens * 0.999 };
  }
  // Before the scan's result: the profit in SOL that came with the trade list, once the whole history was read.
  const e = early[row.trade.signature];
  if (e) return e.matchedTokens <= 0 ? { kind: "unknown" } : { kind: "profit", usd: null, sol: e.profitSol, partial: e.matchedTokens < row.trade.tokens * 0.999 };
  return scanDone ? { kind: "unknown" } : { kind: "pending" };
}

/** Dollars with a sign when it is a gain or a loss: +$903, -$1,370. */
export function signedUsd(x: number): string {
  return `${x > 0 ? "+" : x < 0 ? "-" : ""}${usd(Math.abs(x))}`;
}

export function signedSol(x: number): string {
  return `${x > 0 ? "+" : x < 0 ? "-" : ""}${sol(Math.abs(x))}`;
}

/** What the "roundtripped" column says for a row. Only the sell that closed a position has one. */
export type RoundTripCell =
  | { kind: "none" }
  | { kind: "gave-back"; usd: number; sol: number; share: number }
  | { kind: "kept" } // the position was closed at or near its peak profit
  | { kind: "unknown"; reason: string };

/** Under this much SOL a round-trip is rounding. */
export const MIN_ROUND_TRIP_SOL = 0.05;

export function roundTripCell(row: Row): RoundTripCell {
  const p = row.position;
  if (!p) return { kind: "none" };
  if (p.status === "unknown") return { kind: "unknown", reason: p.reason ?? "No price history." };
  if ((p.roundTripSol ?? 0) < MIN_ROUND_TRIP_SOL) return { kind: "kept" };
  return { kind: "gave-back", usd: p.roundTripUsd ?? 0, sol: p.roundTripSol!, share: p.gaveBack ?? 0 };
}

/** SOL to two decimals under ten, one decimal from ten up, whole from a hundred. */
export function sol(x: number): string {
  return `${x >= 100 ? Math.round(x) : x.toFixed(x >= 10 ? 1 : 2)} SOL`;
}

/** How a coin is written in a row: its ticker, and its name when that says something more. With no metadata the ticker is the shortened address. */
export function tokenLabel(mint: string, tokens: Record<string, TokenInfo> | undefined): { ticker: string; name: string | null; image?: string } {
  const info = tokens?.[mint];
  const ticker = info?.symbol ?? shortMint(mint);
  const name = info?.name && info.name.toLowerCase() !== ticker.toLowerCase() ? info.name : null;
  return { ticker, name, ...(info?.image ? { image: info.image } : {}) };
}

export const explorerUrl = (mint: string) => `https://dexscreener.com/solana/${mint}`;

/** A wallet that does this many transactions a day (counting everything, not only trades) takes a long time to read. */
export const VERY_ACTIVE_PER_DAY = 300;
/** Below this many transactions read there is too little to judge by. */
const VERY_ACTIVE_MIN_READ = 300;

/**
 * Whether the history read so far says the wallet is very active: bots and heavy traders, where one day alone can be a thousand transactions. It
 * is judged on how many transactions were read against how far back they reach, so it shows up a few pages in. `now` is seconds since 1970.
 */
export function veryActive(coverage: { transactions: number; oldest: number | null }, now: number): boolean {
  if (coverage.oldest === null || coverage.transactions < VERY_ACTIVE_MIN_READ) return false;
  // A history that reaches back less than an hour counts as an hour, so a burst does not read as an endless rate.
  const days = Math.max(now - coverage.oldest, 3600) / 86400;
  return coverage.transactions / days >= VERY_ACTIVE_PER_DAY;
}

/** replay-fumble-9msk…-2026-11-22.xlsx: the wallet's ends and the day of the scan. */
export function fumbleFileName(r: { wallet: string; scannedAt: number }): string {
  const day = new Date(r.scannedAt * 1000).toISOString().slice(0, 10);
  return `replay-fumble-${r.wallet.slice(0, 4)}-${r.wallet.slice(-4)}-${day}.xlsx`.toLowerCase();
}

/** Where the page keeps the wallets last scanned in this browser, so they can be scanned again with one tap. */
export const RECENT_KEY = "replay-recent-wallets";
export const RECENT_MAX = 5;

export interface RecentWallet {
  wallet: string;
  /** Seconds since 1970. */
  at: number;
}

/** What was stored, trusted no further than it checks out: anything that is not a wallet address with a time is dropped, newest first. */
export function parseRecent(raw: string | null): RecentWallet[] {
  try {
    const list = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((x): x is RecentWallet => !!x && typeof x.wallet === "string" && isWalletAddress(x.wallet) && typeof x.at === "number" && Number.isFinite(x.at))
      .sort((a, b) => b.at - a.at)
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** The list with this wallet put first (a wallet scanned again moves up, it is not listed twice), keeping only the latest few. */
export function rememberWallet(list: RecentWallet[], wallet: string, at: number): RecentWallet[] {
  return [{ wallet, at }, ...list.filter((r) => r.wallet !== wallet)].slice(0, RECENT_MAX);
}

const DAY = 86400;
/** Each unit, biggest first, in seconds. A month is 30.44 days (a year over twelve), so the months of a long span add up to its years. */
const SPAN_UNITS: [string, number][] = [
  ["year", 365 * DAY],
  ["month", 30.44 * DAY],
  ["week", 7 * DAY],
  ["day", DAY],
  ["hour", 3600],
  ["minute", 60],
];

/** A span as its biggest unit and the unit under it (left out when there is none to add), or null when it is under a minute. */
function spanParts(seconds: number): { n: number; unit: string; rest: { n: number; unit: string } | null } | null {
  for (let i = 0; i < SPAN_UNITS.length; i++) {
    const [unit, size] = SPAN_UNITS[i];
    if (seconds < size) continue;
    const n = Math.floor(seconds / size);
    const next = SPAN_UNITS[i + 1];
    const rest = next ? Math.floor((seconds - n * size) / next[1]) : 0;
    return { n, unit, rest: rest > 0 ? { n: rest, unit: next![0] } : null };
  }
  return null;
}

/**
 * How far back a set of trades reaches, as the two biggest units that apply: "3 days 4 hours", "2 hours 15 minutes", "2 weeks 6 days",
 * "5 months 2 weeks", "1 year 3 months". `full` is the same span in one unit for a hover: hours, or minutes when it is under an hour.
 * `oldest` is the time of the oldest trade and `now` the time it is measured from, both in seconds since 1970; a clock that is behind counts as
 * no time at all.
 */
export function reachSpan(oldest: number, now: number): { label: string; full: string } {
  const seconds = Math.max(0, Math.floor(now - oldest));
  const noun = (n: number, unit: string) => `${n.toLocaleString("en-US")} ${unit}${n === 1 ? "" : "s"}`;
  const parts = spanParts(seconds);
  const label = parts ? (parts.rest ? `${noun(parts.n, parts.unit)} ${noun(parts.rest.n, parts.rest.unit)}` : noun(parts.n, parts.unit)) : "less than a minute";
  const full = seconds < 3600 ? noun(Math.max(1, Math.floor(seconds / 60)), "minute") : noun(Math.floor(seconds / 3600), "hour");
  return { label, full };
}

/**
 * How long ago something happened, in the way it reads best: "just now", "5 minutes ago", "2 hours 15 minutes ago", "3 days 4 hours ago",
 * "2 weeks 6 days ago", "5 months 2 weeks ago", "1 year 3 months ago", and once it is a year and seven months or more, whole years: "2 years ago".
 * `at` is the time of the event and `now` the time it is measured from, both in seconds since 1970.
 */
export function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor(now - at));
  const YEAR = 365 * 86400;
  // A year and seven months: from here the months stop mattering, so it is rounded to whole years.
  if (seconds >= YEAR * (1 + 7 / 12)) {
    const years = Math.round(seconds / YEAR);
    return `${years.toLocaleString("en-US")} ${years === 1 ? "year" : "years"} ago`;
  }
  if (seconds < 60) return "just now";
  return `${reachSpan(at, now).label} ago`;
}

const SHORT: Record<string, string> = { year: "y", month: "mo", week: "w", day: "d", hour: "h", minute: "m" };

/**
 * `ago` as one short unit, rounded, for a narrow place like a table: "5m ago", "2h ago", "3d ago", "3w ago", "3mo ago", "1y ago", "2y ago". Two months
 * and four weeks is 3mo, and a number that rounds up to the next unit becomes it (59.6 minutes is 1h, not 60m).
 */
export function agoShort(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor(now - at));
  let i = SPAN_UNITS.findIndex(([, size]) => seconds >= size);
  if (i < 0) return "just now";
  let n = Math.round(seconds / SPAN_UNITS[i][1]);
  if (i > 0 && n * SPAN_UNITS[i][1] >= SPAN_UNITS[i - 1][1]) {
    i -= 1;
    n = Math.round(seconds / SPAN_UNITS[i][1]);
  }
  return `${n.toLocaleString("en-US")}${SHORT[SPAN_UNITS[i][0]]} ago`;
}
