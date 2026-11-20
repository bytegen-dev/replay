import data from "../data/gold.json" with { type: "json" };

/**
 * Gold's price (US dollars a troy ounce) for a month, read from a saved list of month-end closes of gold futures
 * (refresh it with `node scripts/update-gold.mjs`). The list starts in August 2000, so earlier months have no price (null);
 * months past its end get the latest one. The last month in the list is the month it was saved, so its price is the latest close.
 */
const prices = data.prices as (number | null)[];
const [startYear, startMonth] = data.start.split("-").map(Number);
const FIRST = startYear * 12 + (startMonth - 1);

/** The first month with a price, as "YYYY-MM". */
export const GOLD_STARTS = data.start;

/** The last month with a price, as "YYYY-MM". */
export const GOLD_ENDS = (() => {
  const n = FIRST + prices.length - 1;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
})();

/** Gold's price in the month `ym` ("YYYY-MM"), or null for a month before the list starts. */
export function goldPrice(ym: string): number | null {
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  const i = y * 12 + (m - 1) - FIRST;
  if (i < 0) return null;
  // A month that has no price of its own (none now) takes the nearest earlier one.
  for (let j = Math.min(i, prices.length - 1); j >= 0; j--) {
    const p = prices[j];
    if (typeof p === "number") return p;
  }
  return null;
}
