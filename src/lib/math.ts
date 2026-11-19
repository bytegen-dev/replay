import { isBuyMonth, type Plan } from "./plan.ts";
import type { MonthRow } from "./types.ts";

export type Overrides = Record<string, number>;

export interface BuyRow extends MonthRow {
  /** USD invested this month (0 for months with no price). */
  amount: number;
  tokens: number | null;
  valueToday: number | null;
  manual: boolean;
  /** False for a month that is not a buying month under the plan (nothing bought; the price is still shown). */
  buy?: boolean;
}

export interface Summary {
  invested: number;
  tokens: number;
  avgPrice: number | null;
  priceToday: number | null;
  valueToday: number | null;
  gain: number | null;
  gainPct: number | null;
  pricedMonths: number;
  skippedMonths: number;
  skipped: string[];
}

export function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

export function tokensBought(amount: number, price: number, decimals: number): number {
  return roundTo(amount / price, decimals);
}

/**
 * The spec asks for ROUND(amount/price, 0). That is right for cheap tokens but
 * rounds expensive ones (e.g. $200 / $3,000) to zero, so fall back to 6
 * decimals when any unrounded purchase is under 100 tokens.
 */
export function chooseDecimals(rows: { price: number | null; fx?: number }[], amount: number): number {
  // `amount` is in the user's currency; `fx` (units per dollar) turns it into the dollars actually spent that month.
  const small = rows.some((r) => r.price !== null && r.price > 0 && amount / (r.fx ?? 1) / r.price < 100);
  return small ? 6 : 0;
}

export function effectivePrice(row: MonthRow, overrides: Overrides): { price: number | null; manual: boolean } {
  const o = overrides[row.month];
  if (o !== undefined && Number.isFinite(o) && o > 0) return { price: o, manual: true };
  return { price: row.price, manual: false };
}

export function buildBuys(
  rows: MonthRow[],
  amount: number,
  priceToday: number | null,
  overrides: Overrides,
  decimals: number,
  plan?: Plan,
): BuyRow[] {
  const start = rows[0]?.month ?? "";
  return rows.map((row) => {
    const { price, manual } = effectivePrice(row, overrides);
    // Not a buying month: nothing is bought, but the holding is still valued at this month's price.
    if (plan && plan !== "monthly" && !isBuyMonth(plan, start, row.month)) {
      return { ...row, price, source: manual ? "manual" : row.source, amount: 0, tokens: 0, valueToday: priceToday === null ? null : 0, manual, buy: false };
    }
    if (price === null) {
      return { ...row, amount: 0, tokens: null, valueToday: null, manual: false };
    }
    // `amount` is what the user buys each month in their own currency; this month's dollars are amount / rate (rate 1 for USD).
    const usd = row.fx && row.fx > 0 ? amount / row.fx : amount;
    const tokens = tokensBought(usd, price, decimals);
    return {
      ...row,
      price,
      source: manual ? "manual" : row.source,
      priceDate: manual ? null : row.priceDate,
      notes: manual ? [{ code: "manual", text: "Price entered manually" }] : row.notes,
      amount: usd,
      tokens,
      valueToday: priceToday === null ? null : tokens * priceToday,
      manual,
    };
  });
}

export function summarize(buys: BuyRow[], priceToday: number | null): Summary {
  // Only buying months count: a month between buys has no tokens and no amount.
  const bought = buys.filter((b) => b.buy !== false);
  const priced = bought.filter((b) => b.tokens !== null);
  const invested = priced.reduce((s, b) => s + b.amount, 0);
  const tokens = priced.reduce((s, b) => s + (b.tokens ?? 0), 0);
  const valueToday = priceToday === null ? null : tokens * priceToday;
  const gain = valueToday === null ? null : valueToday - invested;
  const skipped = bought.filter((b) => b.tokens === null).map((b) => b.month);
  return {
    invested,
    tokens,
    avgPrice: tokens > 0 ? invested / tokens : null,
    priceToday,
    valueToday,
    gain,
    gainPct: gain !== null && invested > 0 ? (gain / invested) * 100 : null,
    pricedMonths: priced.length,
    skippedMonths: skipped.length,
    skipped,
  };
}
