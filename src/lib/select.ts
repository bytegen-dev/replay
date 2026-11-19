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
  /**
   * Stocks only trade on some days. Month-end then means the last trading day on or before the target, and the
   * other bases mean the first trading day on or after it, never a day from the neighbouring month.
   */
  tradingDays?: boolean;
}

/** Longest run of closed days to look across: a weekend plus a holiday or two. */
export const TRADING_WINDOW_DAYS = 6;

/** The trading day a stock purchase on `target` would happen on, or null when none is near. */
export function findTradingDay(byDate: Map<string, DailyPoint>, target: string, basis: Basis): DailyPoint | null {
  const step = basis === "month-end" ? -1 : 1;
  for (let off = 0; off <= TRADING_WINDOW_DAYS; off++) {
    const p = byDate.get(addDays(target, off * step));
    if (p) return p;
  }
  return null;
}

/**
 * How far a point from a thin pool (`sparse`) may be from the target. Such pools trade on only some days,
 * so "no trade within 3 days" often just means the pool was quiet, not that the price is unknown.
 */
export const SPARSE_OFFSET_DAYS = 7;

/**
 * Find the point for `target`, or the nearest one within MAX_OFFSET_DAYS.
 * Past that, only `sparse` points count, out to SPARSE_OFFSET_DAYS.
 * Ties between an earlier and a later day go to the earlier day.
 */
export function findNearest(
  byDate: Map<string, DailyPoint>,
  target: string,
  maxOffset = MAX_OFFSET_DAYS,
  sparseOffset = SPARSE_OFFSET_DAYS,
): DailyPoint | null {
  const exact = byDate.get(target);
  if (exact) return exact;
  for (let off = 1; off <= sparseOffset; off++) {
    const sparseOnly = off > maxOffset;
    const before = byDate.get(addDays(target, -off));
    if (before && (!sparseOnly || before.sparse)) return before;
    const after = byDate.get(addDays(target, off));
    if (after && (!sparseOnly || after.sparse)) return after;
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
  if (opts.tradingDays) return selectTradingMonth(month, target, byDate, opts);
  const point = findNearest(byDate, target);
  if (!point && opts.earliestAllowed && target < opts.earliestAllowed) {
    return empty(
      "out-of-range",
      `No data: ${target} is before ${opts.earliestAllowed}, the oldest day the free CoinGecko tier serves (last 365 days), and no pool data covers it`,
    );
  }
  if (!point) {
    return empty("no-data", `No price within ${MAX_OFFSET_DAYS} days of ${target}`);
  }

  const notes: Note[] = [];
  if (point.date !== target) {
    const gap = Math.round((Date.parse(point.date) - Date.parse(target)) / 86_400_000);
    notes.push({
      code: "nearest-day",
      text:
        Math.abs(gap) > MAX_OFFSET_DAYS
          ? `No trade within ${MAX_OFFSET_DAYS} days of ${target}; used the nearest trade, ${point.date} (${Math.abs(gap)} days ${gap < 0 ? "earlier" : "later"})`
          : `No price on ${target}; used ${point.date}`,
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

/** A stock month: the trading day on or around the target, with a plain note when the market was closed that day. */
function selectTradingMonth(month: string, target: string, byDate: Map<string, DailyPoint>, opts: SelectOptions): MonthRow {
  const point = findTradingDay(byDate, target, opts.basis);
  if (!point) {
    return {
      month,
      targetDate: target,
      priceDate: null,
      price: null,
      source: "none",
      notes: [{ code: "no-data", text: `No trading day with a price near ${target}` }],
    };
  }
  const notes: Note[] = [];
  if (point.date !== target) notes.push({ code: "market-closed", text: `Market closed on ${target}; used ${point.date}` });
  notes.push(...liquidityNotes(byDate, point));
  return { month, targetDate: target, priceDate: point.date, price: point.price, source: point.source ?? opts.source, notes };
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
