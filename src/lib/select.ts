import { addDays, monthsBetween, targetDate } from "./months.ts";
import type { Basis, DailyPoint, MonthRow, Note, PriceSource } from "./types.ts";

export const MAX_OFFSET_DAYS = 3;
/** Below this 24h USD volume a price is flagged as illiquid. */
export const LOW_VOLUME_USD = 1000;
/** Flag when a price deviates from the median of neighbouring days by more than this fraction. */
export const OUTLIER_RATIO = 0.5;

export interface SelectOptions {
  basis: Basis;
  basisDay?: number;
  source: PriceSource;
  /** Today (UTC, YYYY-MM-DD). Targets after today are "future", never estimated. */
  today: string;
  /** Earliest day the data source can serve, or null for unlimited. */
  earliestAllowed: string | null;
}

/**
 * Find the point for `target`, or the nearest one within MAX_OFFSET_DAYS.
 * Ties between an earlier and a later day go to the earlier day.
 */
export function findNearest(
  byDate: Map<string, DailyPoint>,
  target: string,
  maxOffset = MAX_OFFSET_DAYS,
): DailyPoint | null {
  const exact = byDate.get(target);
  if (exact) return exact;
  for (let off = 1; off <= maxOffset; off++) {
    const before = byDate.get(addDays(target, -off));
    if (before) return before;
    const after = byDate.get(addDays(target, off));
    if (after) return after;
  }
  return null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Illiquidity / noise flags for the point on `date`. */
export function liquidityNotes(byDate: Map<string, DailyPoint>, point: DailyPoint): Note[] {
  const notes: Note[] = [];
  if (point.volume !== undefined && point.volume < LOW_VOLUME_USD) {
    notes.push({
      code: "low-volume",
      text: `Very low volume on ${point.date} ($${point.volume.toFixed(0)} in 24h); price may be unreliable`,
    });
  }
  const neighbours: number[] = [];
  for (let off = -3; off <= 3; off++) {
    if (off === 0) continue;
    const p = byDate.get(addDays(point.date, off));
    if (p && p.price > 0) neighbours.push(p.price);
  }
  if (neighbours.length >= 2) {
    const m = median(neighbours);
    if (m > 0 && Math.abs(point.price - m) / m > OUTLIER_RATIO) {
      notes.push({
        code: "outlier",
        text: `Price differs from surrounding days by more than ${OUTLIER_RATIO * 100}%; possible bad tick`,
      });
    }
  }
  return notes;
}

export function selectMonthPrice(
  month: string,
  byDate: Map<string, DailyPoint>,
  opts: SelectOptions,
): MonthRow {
  const target = targetDate(month, opts.basis, opts.basisDay);
  const empty = (code: Note["code"], text: string): MonthRow => ({
    month,
    targetDate: target,
    priceDate: null,
    price: null,
    source: "none",
    notes: [{ code, text }],
  });

  if (target > opts.today) {
    return empty("future", `${target} has not happened yet; no price`);
  }
  const point = findNearest(byDate, target);
  if (!point && opts.earliestAllowed && target < opts.earliestAllowed) {
    return empty(
      "out-of-range",
      `No data: ${target} is before ${opts.earliestAllowed}, the oldest day the free CoinGecko tier serves (last 365 days)`,
    );
  }
  if (!point) {
    return empty("no-data", `No price within ${MAX_OFFSET_DAYS} days of ${target}`);
  }

  const notes: Note[] = [];
  if (point.date !== target) {
    notes.push({
      code: "nearest-day",
      text: `No price on ${target}; used ${point.date}`,
    });
  }
  notes.push(...liquidityNotes(byDate, point));

  return {
    month,
    targetDate: target,
    priceDate: point.date,
    price: point.price,
    source: point.source ?? opts.source,
    notes,
  };
}

export function selectAllMonths(
  start: string,
  end: string,
  points: DailyPoint[],
  opts: SelectOptions,
): MonthRow[] {
  const byDate = new Map(points.map((p) => [p.date, p]));
  return monthsBetween(start, end).map((m) => selectMonthPrice(m, byDate, opts));
}
