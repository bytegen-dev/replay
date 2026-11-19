/**
 * What the form remembers in the address bar, so a reload (or a shared link) brings back the tab, the asset, the amount and the
 * range. A range that ends last month is stored as a length ("10y") so an old link still means "the last ten years".
 */

import { isMonth } from "./months.ts";

export const MAX_RANGE_MONTHS = 720;

export function shiftYm(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
}

const monthsInclusive = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5)) + 1;

/** `lastMonth` is the month before the current one: where "up to last month" ranges stop. */
export function encodeRange(start: string, end: string, lastMonth: string): Record<string, string> {
  if (!isMonth(start) || !isMonth(end) || start > end) return {};
  if (end === lastMonth) {
    const n = monthsInclusive(start, end);
    return { range: n % 12 === 0 ? `${n / 12}y` : `${n}m` };
  }
  return { from: start, to: end };
}

export function decodeRange(p: URLSearchParams, lastMonth: string): { start: string; end: string } | null {
  const range = /^(\d{1,3})([ym])$/.exec(p.get("range") ?? "");
  if (range) {
    const n = Number(range[1]) * (range[2] === "y" ? 12 : 1);
    if (n >= 1 && n <= MAX_RANGE_MONTHS) return { start: shiftYm(lastMonth, -(n - 1)), end: lastMonth };
  }
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  if (isMonth(from) && isMonth(to) && from <= to && monthsInclusive(from, to) <= MAX_RANGE_MONTHS) return { start: from, end: to };
  return null;
}

/** The number in an amount box: "500,000", "1 500" and "1_500.50" all read as numbers. Anything else is NaN. */
export function parseAmount(s: string): number {
  const t = s.replace(/[,\s_]/g, "");
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : Number.NaN;
}

/** A plain amount such as "500" or "1500.5"; anything else is dropped. */
export function cleanAmount(s: string | null): string | null {
  const t = s ? String(parseAmount(s)) : "";
  return t && /^\d{1,12}(\.\d{1,8})?$/.test(t) && Number(t) > 0 ? t : null;
}

/** Replaces the page's query string without adding a history entry or reloading. Empty values are left out. */
export function writeQuery(params: Record<string, string | undefined | null | false>) {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  const next = `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
}

export const readQuery = () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);

/** Groups an amount typed so far with commas as you go: "1234567.5" becomes "1,234,567.5". Keeps a trailing dot, drops junk. */
export function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const int = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, "").slice(0, 12);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (dot === -1) return grouped;
  return `${grouped || "0"}.${cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 8)}`;
}
