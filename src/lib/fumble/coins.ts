import { figure, type Display } from "./money.ts";
import type { ApiCoin, ApiTrade } from "./service.ts";

/**
 * The trades by coin: one row per coin the wallet traded, not one per transaction. A row says what was bought (in money and in tokens), what was
 * sold, the average price paid and the average price sold at, what is still held, and the profit made. Pure, so the page, the share picture and the
 * spreadsheet all work from the same numbers.
 *
 * The averages are over everything read: total money over total tokens. The profit is the realized profit of the sells, each matched to the buys it
 * came from (oldest first, see lots.ts), so it stays right when a coin was bought and sold in stages.
 */

/** What is known about each sell's profit: the SOL made on the matched part, and how many of the tokens sold were matched to a buy. */
export type SellProfits = Record<string, { profitSol: number; matchedTokens: number }>;

export interface CoinRow {
  mint: string;
  boughtSol: number;
  boughtTokens: number;
  soldSol: number;
  soldTokens: number;
  /** The first and last trade, seconds since 1970. */
  firstAt: number;
  lastAt: number;
  /** Tokens still held, by the trades read. Zero once sold out (a few leftover dust tokens count as sold out). */
  balance: number;
  /** More was sold than the trades read show bought: some of it came from before the history starts, so its cost is not known. */
  partial: boolean;
  /** Average price paid and sold at, in SOL per token. Null when nothing was bought, or nothing was sold. */
  avgEntrySol: number | null;
  avgExitSol: number | null;
  /** Realized profit in SOL, null when there is nothing sold yet or not worked out yet; and as a share of what the sold coins cost. */
  profitSol: number | null;
  profitPct: number | null;
  /** True when every sell of this coin is of tokens whose purchase the history does not show. */
  costUnknown: boolean;
  /** What the scan worked out with prices (dollars, and the total fumble of this coin), once the scan has finished. */
  extra: ApiCoin | null;
}

/** A balance under this share of what was bought counts as sold out: selling "everything" leaves dust. */
const DUST = 0.005;

export function coinRows(trades: ApiTrade[], profits: SellProfits, extras: ApiCoin[] | null = null): CoinRow[] {
  const extraBy = new Map((extras ?? []).map((c) => [c.token, c]));
  const by = new Map<string, ApiTrade[]>();
  for (const t of trades) by.set(t.token, [...(by.get(t.token) ?? []), t]);

  const out: CoinRow[] = [];
  for (const [mint, list] of by) {
    let boughtSol = 0;
    let boughtTokens = 0;
    let soldSol = 0;
    let soldTokens = 0;
    let firstAt = Infinity;
    let lastAt = 0;
    let profit = 0;
    let matchedCost = 0;
    let sells = 0;
    let known = 0;
    for (const t of list) {
      firstAt = Math.min(firstAt, t.time);
      lastAt = Math.max(lastAt, t.time);
      if (t.side === "buy") {
        boughtSol += t.sol;
        boughtTokens += t.tokens;
        continue;
      }
      soldSol += t.sol;
      soldTokens += t.tokens;
      sells++;
      const p = profits[t.signature];
      if (p && p.matchedTokens > 0) {
        known++;
        profit += p.profitSol;
        matchedCost += (t.sol * Math.min(1, p.matchedTokens / t.tokens)) - p.profitSol;
      }
    }
    const left = boughtTokens - soldTokens;
    const partial = left < -boughtTokens * 1e-6 - 1e-9;
    const balance = left <= boughtTokens * DUST ? 0 : left;
    const worked = sells > 0 && Object.keys(profits).length > 0 && list.filter((t) => t.side === "sell").every((t) => profits[t.signature]);
    out.push({
      mint,
      boughtSol,
      boughtTokens,
      soldSol,
      soldTokens,
      firstAt,
      lastAt,
      balance,
      partial,
      avgEntrySol: boughtTokens > 0 ? boughtSol / boughtTokens : null,
      avgExitSol: soldTokens > 0 ? soldSol / soldTokens : null,
      profitSol: worked && known > 0 ? profit : null,
      profitPct: worked && known > 0 && matchedCost > 0 ? profit / matchedCost : null,
      costUnknown: worked && known === 0,
      extra: extraBy.get(mint) ?? null,
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

/** Small numbers the way traders write them: 0.0₅42 for 0.0000042, so a price of many zeros stays readable. */
const SUB = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
export function smallNumber(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1000) return `${sign}${Math.round(a).toLocaleString("en-US")}`;
  if (a >= 1) return `${sign}${a.toPrecision(4).replace(/\.?0+$/, "")}`;
  if (a >= 0.01) return `${sign}${a.toPrecision(3).replace(/\.?0+$/, "")}`;
  let zeros = -Math.floor(Math.log10(a)) - 1;
  let digits = Math.round(a * 10 ** (zeros + 2));
  if (digits >= 100) {
    digits = Math.round(digits / 10);
    zeros -= 1;
  }
  return `${sign}0.0${[...String(zeros)].map((d) => SUB[Number(d)]).join("")}${String(digits).replace(/0+$/, "") || "0"}`;
}

/** Token amounts short: 7.28M, 342.3, 1.5K. */
export function compactAmount(n: number): string {
  const a = Math.abs(n);
  const unit = (v: number, s: string) => `${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)}${s}`;
  if (a >= 1e9) return unit(a / 1e9, "B");
  if (a >= 1e6) return unit(a / 1e6, "M");
  if (a >= 1e3) return unit(a / 1e3, "K");
  return a >= 1 ? a.toFixed(1).replace(/\.0$/, "") : smallNumber(a);
}

const isFiat = (d: Display): d is Display & { symbol: string; perUsd: number } => "perUsd" in d;

/**
 * A price per token in the chosen currency: SOL, dollars or another currency. Without a dollar price it is in SOL, whatever was picked, as
 * with every other figure.
 */
export function unitPrice(d: Display, solPerToken: number | null, usdPerToken: number | null): string {
  if (solPerToken === null) return "—";
  if (isFiat(d) && usdPerToken !== null) return `${d.symbol}${smallNumber(usdPerToken * d.perUsd)}`;
  return `${smallNumber(solPerToken)} SOL`;
}

/** The bought, sold and profit amounts of a row in the chosen currency (dollars come from the scan's result, so they appear when it finishes). */
export function coinMoney(c: CoinRow, d: Display) {
  const e = c.extra;
  return {
    bought: figure(d, c.boughtSol, e?.boughtUsd ?? null).main,
    sold: figure(d, c.soldSol, e?.soldUsd ?? null).main,
    profit: c.profitSol === null ? null : figure(d, c.profitSol, e?.profitUsd ?? null, true),
    entry: unitPrice(d, c.avgEntrySol, e?.boughtUsd != null && c.boughtTokens > 0 ? e.boughtUsd / c.boughtTokens : null),
    exit: unitPrice(d, c.avgExitSol, e?.soldUsd != null && c.soldTokens > 0 ? e.soldUsd / c.soldTokens : null),
  };
}

