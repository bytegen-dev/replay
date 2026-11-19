/**
 * Exchange-rate maths with no network: reading each source's format into one shape, and looking up the rate on a date.
 * A rate here is always "units of the currency per 1 US dollar" (so naira per dollar is about 1,480 today).
 */

export interface FxPoint {
  /** YYYY-MM-DD. */
  date: string;
  /** Units of the currency per 1 USD. */
  perUsd: number;
  /** True for a monthly figure (an end-of-month official rate), which can stand in for a longer gap than a daily one. */
  monthly?: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

/** FRED's CSV: a header, then "date,value" lines where a missing day is ".". */
export function parseFredCsv(csv: string, quote: "ccy-per-usd" | "usd-per-ccy"): FxPoint[] {
  const out: FxPoint[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(",");
    const v = num(raw);
    if (!date || !DAY.test(date) || v === null) continue;
    out.push({ date, perUsd: quote === "usd-per-ccy" ? 1 / v : v });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Frankfurter's time series with base USD: { rates: { "1999-01-04": { TRY: 0.31 } } }. */
export function parseFrankfurter(json: unknown, code: string): FxPoint[] {
  const rates = (json as { rates?: Record<string, Record<string, unknown>> } | null)?.rates;
  if (!rates || typeof rates !== "object") return [];
  const out: FxPoint[] = [];
  for (const [date, row] of Object.entries(rates)) {
    const v = num(row?.[code]);
    if (DAY.test(date) && v !== null) out.push({ date, perUsd: v });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** DBnomics IMF series: parallel `period` ("2013-03") and `value` arrays. Each month becomes a point on its last day. */
export function parseImf(json: unknown): FxPoint[] {
  const doc = (json as { series?: { docs?: { period?: unknown[]; value?: unknown[] }[] } } | null)?.series?.docs?.[0];
  if (!doc || !Array.isArray(doc.period) || !Array.isArray(doc.value)) return [];
  const out: FxPoint[] = [];
  doc.period.forEach((p, i) => {
    const v = num(doc.value![i]);
    if (typeof p !== "string" || !/^\d{4}-\d{2}$/.test(p) || v === null) return;
    const [y, m] = p.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    out.push({ date: last, perUsd: v, monthly: true });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Joins two histories: everything from `base`, plus `extra` points that are older than base starts or newer than it ends. */
export function mergeHistory(base: FxPoint[], extra: FxPoint[]): FxPoint[] {
  if (base.length === 0) return [...extra];
  const first = base[0].date;
  const last = base[base.length - 1].date;
  return [...extra.filter((p) => p.date < first), ...base, ...extra.filter((p) => p.date > last)].sort((a, b) => a.date.localeCompare(b.date));
}

/** How far back a rate may stand in for a missing day: a week and a bit for daily data, five weeks for monthly figures. */
const TOLERANCE_DAYS = { daily: 10, monthly: 40 };

/**
 * The rate on a date: the latest observation on or before it, if it is recent enough. Null when the series starts later
 * than the date or has a gap longer than the tolerance (the caller then says "no rate", never guesses).
 */
export function rateOn(points: FxPoint[], date: string): { perUsd: number; date: string } | null {
  if (points.length === 0 || !DAY.test(date)) return null;
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const p = points[found];
  const gap = (dayMs(date) - dayMs(p.date)) / DAY_MS;
  return gap <= (p.monthly ? TOLERANCE_DAYS.monthly : TOLERANCE_DAYS.daily) ? { perUsd: p.perUsd, date: p.date } : null;
}

/** Cross rate: units of `to` per 1 `from`, given each one's units per dollar (USD itself is 1). */
export function crossRate(fromPerUsd: number, toPerUsd: number): number {
  return toPerUsd / fromPerUsd;
}

/** The earliest date we have a rate for. */
export const firstDate = (points: FxPoint[]): string | null => points[0]?.date ?? null;
