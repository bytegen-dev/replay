import { rateOn, type FxPoint } from "./fx.ts";
import { monthsBetween } from "./months.ts";

/**
 * "Wayback" for money itself: put a fixed amount of one currency into another every month, and see what it came to. For
 * example 100,000 naira a month into US dollars since 2016. The price of 1 unit of the currency you buy, in the currency
 * you spend, is the exchange rate that month. Pure maths on rate histories you pass in; no network.
 */

export interface FxDcaRequest {
  /** The currency you spend each month. */
  from: string;
  /** The currency you buy. */
  to: string;
  /** How much of `from` you spend each month. */
  amount: number;
  startMonth: string;
  endMonth: string;
}

export interface FxDcaRow {
  month: string;
  /** The day the rate is for (the last day of the month, or today for the current month). */
  date: string;
  /** Units of `from` per 1 unit of `to` on that day. Null when no rate exists. */
  rate: number | null;
  /** How much `to` the month's buy got. */
  bought: number | null;
}

export interface FxDcaResult {
  rows: FxDcaRow[];
  months: number;
  pricedMonths: number;
  /** Total of `from` spent. */
  spent: number;
  /** Total of `to` bought. */
  held: number;
  /** Average rate paid (`from` per `to`). */
  averageRate: number | null;
  rateToday: number | null;
  /** What the holding is worth today, in `from`. */
  valueToday: number | null;
  gain: number | null;
  gainPct: number | null;
  /** The same total spent all at once on the first month, valued today (in `from`). */
  lumpSumValue: number | null;
}

/** Units of a currency per US dollar on a date. USD is always 1. */
function perUsd(code: string, series: FxPoint[], date: string): number | null {
  if (code === "USD") return 1;
  return rateOn(series, date)?.perUsd ?? null;
}

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export function runFxDca(req: FxDcaRequest, fromSeries: FxPoint[], toSeries: FxPoint[], today: string): FxDcaResult {
  const months = monthsBetween(req.startMonth, req.endMonth);
  const rateAt = (date: string): number | null => {
    const f = perUsd(req.from, fromSeries, date);
    const t = perUsd(req.to, toSeries, date);
    return f !== null && t !== null && t > 0 ? f / t : null;
  };

  const rows: FxDcaRow[] = months.map((month) => {
    const date = lastDay(month) > today ? today : lastDay(month);
    const rate = rateAt(date);
    return { month, date, rate, bought: rate === null ? null : req.amount / rate };
  });

  const priced = rows.filter((r) => r.rate !== null);
  const spent = priced.length * req.amount;
  const held = priced.reduce((s, r) => s + (r.bought ?? 0), 0);
  const rateToday = rateAt(today);
  const valueToday = rateToday === null ? null : held * rateToday;
  const first = priced[0];
  return {
    rows,
    months: months.length,
    pricedMonths: priced.length,
    spent,
    held,
    averageRate: held > 0 ? spent / held : null,
    rateToday,
    valueToday,
    gain: valueToday === null ? null : valueToday - spent,
    gainPct: valueToday === null || spent <= 0 ? null : ((valueToday - spent) / spent) * 100,
    lumpSumValue: first && first.rate !== null && rateToday !== null ? (spent / first.rate) * rateToday : null,
  };
}
