import type { BuyRow } from "./math.ts";

/** Pure helpers for the charts: the data behind them, and the axis ticks. No drawing here. */

export interface GrowthPoint {
  /** Date of the purchase, ms since the epoch (UTC). */
  t: number;
  /** YYYY-MM-DD of that date. */
  date: string;
  /** Everything put in so far. */
  invested: number;
  /** What the holding was worth that day: units held so far at that day's price. */
  value: number;
  /** The price that day. */
  price: number;
  /** Average cost per unit so far (invested divided by units). */
  avgCost: number;
}

const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * How the holding grew, one point per purchase, plus a final point for today. Months with no price were never
 * bought, so they add nothing and get no point. `value` on each date is what the units held *then* were worth at
 * *that* day's price, so the line shows the real path, not today's price applied backwards.
 */
export function growthSeries(buys: BuyRow[], priceToday: number | null, priceTodayDate: string | null): GrowthPoint[] {
  const out: GrowthPoint[] = [];
  let invested = 0;
  let units = 0;
  for (const b of [...buys].sort((a, c) => a.month.localeCompare(c.month))) {
    if (b.tokens === null || b.price === null || !(b.price > 0)) continue;
    invested += b.amount;
    units += b.tokens;
    // Nothing bought yet (a plan whose first buy had no price): there is no holding to draw.
    if (!(units > 0)) continue;
    const date = b.priceDate ?? b.targetDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({ t: dayMs(date), date, invested, value: units * b.price, price: b.price, avgCost: units > 0 ? invested / units : 0 });
  }
  const last = out[out.length - 1];
  if (last && priceToday !== null && priceToday > 0 && priceTodayDate && /^\d{4}-\d{2}-\d{2}$/.test(priceTodayDate) && dayMs(priceTodayDate) > last.t) {
    out.push({ t: dayMs(priceTodayDate), date: priceTodayDate, invested: last.invested, value: (last.value / last.price) * priceToday, price: priceToday, avgCost: last.avgCost });
  }
  return out;
}

/* ------------------------------ value axis ------------------------------ */

function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

export interface Scale {
  /** Evenly spaced, round numbers covering the data. */
  ticks: number[];
  lo: number;
  hi: number;
}

/**
 * A readable value axis for data between `min` and `max`: round tick values, with the axis stretched to the first and
 * last tick. `zero` anchors the bottom at 0 (right for money in and out); otherwise the axis hugs the data.
 */
export function niceScale(min: number, max: number, zero: boolean, count = 4): Scale {
  let lo = zero ? 0 : min;
  let hi = max;
  if (!(hi > lo)) {
    // A flat line: give it some air so it isn't drawn on the edge.
    const pad = Math.abs(hi) * 0.1 || 1;
    lo = zero ? 0 : lo - pad;
    hi = hi + pad;
  }
  const step = niceStep((hi - lo) / count);
  const first = zero ? 0 : Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = first, i = 0; v <= last + step * 1e-9 && i < 50; i++, v = first + i * step) ticks.push(Number(v.toPrecision(12)));
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1] };
}

/** $0, $250, $12K, $1.4M, $3.2B. For axes and tooltips on larger sums. */
export function moneyShort(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const fmt = (v: number, unit: string) => `${sign}$${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2).replace(/\.?0+$/, "")}${unit}`;
  if (a >= 1e12) return fmt(a / 1e12, "T");
  if (a >= 1e9) return fmt(a / 1e9, "B");
  if (a >= 1e6) return fmt(a / 1e6, "M");
  if (a >= 1e3) return fmt(a / 1e3, "K");
  return `${sign}$${a >= 10 ? Math.round(a).toString() : a.toFixed(2).replace(/\.?0+$/, "") || "0"}`;
}

/** Drops every other tick until no more than `max` remain, so what is left stays evenly spaced (Jan, Jan, Jan, not Jan, Jul, Jan). */
export function thinTicks<T>(ticks: T[], max: number): T[] {
  let out = ticks;
  while (out.length > Math.max(2, max)) out = out.filter((_, i) => i % 2 === 0);
  return out;
}

/* ------------------------------ time axis ------------------------------ */

export interface TimeTick {
  t: number;
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Round-number ticks along a time axis, at most `maxCount`: years for long ranges, months for a year or two, days,
 * hours, then minutes for short ones. Labels carry only what changes ("2013", "Mar 2026", "12 Nov", "13:40").
 */
export function timeTicks(minMs: number, maxMs: number, maxCount = 6): TimeTick[] {
  const span = maxMs - minMs;
  if (!(span > 0)) return [];
  const out: TimeTick[] = [];

  if (span > 3 * 365 * DAY) {
    const years = span / (365.25 * DAY);
    const step = [1, 2, 5, 10, 20].find((s) => years / s <= maxCount) ?? 20;
    const startYear = Math.ceil(new Date(minMs).getUTCFullYear() / step) * step;
    for (let y = startYear; Date.UTC(y, 0, 1) <= maxMs; y += step) if (Date.UTC(y, 0, 1) >= minMs) out.push({ t: Date.UTC(y, 0, 1), label: String(y) });
    return out;
  }
  if (span > 100 * DAY) {
    const months = span / (30.44 * DAY);
    const step = [1, 2, 3, 6].find((s) => months / s <= maxCount) ?? 6;
    const d = new Date(minMs);
    let y = d.getUTCFullYear();
    let m = Math.ceil(d.getUTCMonth() / step) * step;
    for (; Date.UTC(y, m, 1) <= maxMs; m += step) {
      if (m >= 12) {
        y += Math.floor(m / 12);
        m %= 12;
      }
      const t = Date.UTC(y, m, 1);
      if (t > maxMs) break;
      if (t >= minMs) out.push({ t, label: `${MONTHS[m]} ${y}` });
    }
    return out;
  }
  const unit = span > 3 * DAY ? DAY : span > 3 * HOUR ? HOUR : 60_000;
  const steps = unit === DAY ? [1, 2, 5, 7, 14] : unit === HOUR ? [1, 2, 3, 6, 12] : [5, 10, 15, 30];
  const step = (steps.find((s) => span / (s * unit) <= maxCount) ?? steps[steps.length - 1]) * unit;
  for (let t = Math.ceil(minMs / step) * step; t <= maxMs; t += step) {
    const d = new Date(t);
    out.push({ t, label: unit === DAY ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` });
  }
  return out;
}

/** "13 Nov 2026" or, for short spans, "13 Nov 2026, 13:40 UTC". */
export function formatChartTime(ms: number, withClock: boolean): string {
  const d = new Date(ms);
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withClock ? `${day}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC` : day;
}
