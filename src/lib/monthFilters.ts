import type { BuyRow } from "./math.ts";

/**
 * Which months of a backtest to show, and in what order. Filtering only changes what the list shows: the totals, charts and
 * exports always use every month.
 */

export type ResultFilter = "all" | "profit" | "loss";
export type SortKey = "month-asc" | "month-desc" | "price-asc" | "price-desc" | "value-desc";

export interface MonthFilter {
  /** A four-digit year, or "all". */
  year: string;
  /** Leave out months that have no price. */
  hideNoPrice: boolean;
  /** Only months that carry a note (a nearest-day price, thin volume, a manual price and so on). */
  onlyNotes: boolean;
  /** Only prices the user edited. */
  onlyEdited: boolean;
  /** Only buys that are worth more than was put in (profit) or less (loss), at today's price. */
  result: ResultFilter;
  /** Price range, as typed. Empty means no limit. */
  minPrice: string;
  maxPrice: string;
  sort: SortKey;
}

export const NO_FILTER: MonthFilter = { year: "all", hideNoPrice: false, onlyNotes: false, onlyEdited: false, result: "all", minPrice: "", maxPrice: "", sort: "month-asc" };

const num = (s: string): number | null => {
  const n = Number(s.trim().replace(/[,$\s]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** True when anything differs from the plain list. */
export function isFiltered(f: MonthFilter): boolean {
  return JSON.stringify(f) !== JSON.stringify(NO_FILTER);
}

export function applyMonthFilters(buys: BuyRow[], f: MonthFilter): BuyRow[] {
  const min = num(f.minPrice);
  const max = num(f.maxPrice);
  const out = buys.filter((b) => {
    if (f.year !== "all" && !b.month.startsWith(f.year)) return false;
    if (f.hideNoPrice && b.tokens === null) return false;
    if (f.onlyNotes && b.notes.length === 0) return false;
    if (f.onlyEdited && !b.manual) return false;
    if (f.result !== "all") {
      if (b.valueToday === null || b.tokens === null) return false;
      if (f.result === "profit" ? b.valueToday < b.amount : b.valueToday >= b.amount) return false;
    }
    if (min !== null || max !== null) {
      if (b.price === null) return false;
      if (min !== null && b.price < min) return false;
      if (max !== null && b.price > max) return false;
    }
    return true;
  });

  // Months with no price always sort last for the price and value orders, since they have nothing to compare.
  const by = (get: (b: BuyRow) => number | null, dir: 1 | -1) => (a: BuyRow, b: BuyRow) => {
    const x = get(a);
    const y = get(b);
    if (x === null && y === null) return a.month.localeCompare(b.month);
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir || a.month.localeCompare(b.month);
  };
  switch (f.sort) {
    case "month-desc":
      return out.sort((a, b) => b.month.localeCompare(a.month));
    case "price-asc":
      return out.sort(by((b) => b.price, 1));
    case "price-desc":
      return out.sort(by((b) => b.price, -1));
    case "value-desc":
      return out.sort(by((b) => b.valueToday, -1));
    default:
      return out.sort((a, b) => a.month.localeCompare(b.month));
  }
}

/** The years present, newest first, for the year picker. */
export function yearsIn(buys: BuyRow[]): string[] {
  return [...new Set(buys.map((b) => b.month.slice(0, 4)))].sort().reverse();
}
