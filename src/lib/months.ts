import type { Basis } from "./types.ts";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function lastDayOfMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The calendar day a month's buy is priced on, as YYYY-MM-DD. */
export function targetDate(month: string, basis: Basis, basisDay = 1): string {
  if (basis === "first-of-month") return `${month}-01`;
  if (basis === "day-of-month") {
    const want = Math.trunc(basisDay);
    const last = lastDayOfMonth(month);
    const day = Math.min(Math.max(1, want), last);
    return `${month}-${String(day).padStart(2, "0")}`;
  }
  const last = lastDayOfMonth(month);
  return `${month}-${String(last).padStart(2, "0")}`;
}

export function formatBasisLabel(basis: Basis, basisDay?: number): string {
  if (basis === "month-end") return "month-end";
  if (basis === "first-of-month") return "first-of-month";
  const d = basisDay ?? 1;
  return `day ${d} of month (clamped to each month's length)`;
}

export function basisBadgeLabel(basis: Basis, basisDay?: number): string {
  if (basis === "month-end") return "Month-end prices";
  if (basis === "first-of-month") return "First-of-month prices";
  return `Day ${basisDay ?? 1} of month`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayUtc(now: number = Date.now()): string {
  return toDateString(now);
}

export function currentMonth(now: number = Date.now()): string {
  return toDateString(now).slice(0, 7);
}
