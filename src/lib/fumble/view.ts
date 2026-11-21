import type { ApiResult, ApiSell, ApiTrade, ScanEvent } from "./service.ts";

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
}

/** The trades, in the order given, each with its sell result when there is one (matched by transaction). */
export function buildRows(trades: ApiTrade[], sells: ApiSell[] | null): Row[] {
  const bySignature = new Map((sells ?? []).map((s) => [s.signature, s]));
  return trades.map((trade) => ({ trade, sell: trade.side === "sell" ? (bySignature.get(trade.signature) ?? null) : null }));
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
  | { kind: "fumbled"; usd: number; peakMultiple: number }
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
  return { kind: "fumbled", usd: s.fumbleUsd!, peakMultiple: s.peakMultiple! };
}

export const explorerUrl = (mint: string) => `https://dexscreener.com/solana/${mint}`;
