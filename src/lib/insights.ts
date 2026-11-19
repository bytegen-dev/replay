import type { GrowthPoint } from "./charts.ts";

/**
 * Plain-language facts about a backtest, worked out from the same series the chart draws. No network and no rendering
 * here, so it is easy to test. Everything is "what actually happened in this run", never a prediction.
 */

export interface BuyFact {
  /** YYYY-MM-DD of the purchase. */
  date: string;
  /** The price paid per unit. */
  price: number;
  /** What one monthly purchase is worth today. */
  nowValue: number;
  /** Today's price divided by the price paid (2 means it doubled). */
  multiple: number;
}

export interface Insights {
  /** The same total, put in all at once on the first buy date, against buying monthly. */
  lumpSum: { date: string; invested: number; value: number; gain: number; gainPct: number; dcaValue: number; dcaMinusLump: number };
  best: BuyFact;
  worst: BuyFact;
  /** The biggest fall in the price from a high to a later low while buying. */
  drop: { pct: number; from: string; to: string } | null;
  /** The longest run of purchases at which the holding was worth less than had been put in. */
  underwater: { months: number; from: string; to: string; still: boolean } | null;
}

const MONTH_MS = 30.4375 * 86_400_000;
const EPS = 1e-9;
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** "2020-03-31" -> "Mar 2020". */
export function monthYear(iso: string): string {
  const t = dayMs(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : iso;
}

/** Null when there is nothing to compare (fewer than two points, or no usable price today). */
export function computeInsights(points: GrowthPoint[], amount: number): Insights | null {
  if (points.length < 2 || !(amount > 0)) return null;
  const last = points[points.length - 1];
  const priceToday = last.price;
  if (!(priceToday > 0)) return null;

  // Points where something was bought (the final "today" point adds no money), each with the dollars that buy cost. The cost
  // is read from the running total, not taken as a fixed amount, because a monthly amount in another currency costs a
  // different number of dollars each month.
  const bought = points.map((p, i) => ({ p, spent: p.invested - (i === 0 ? 0 : points[i - 1].invested) })).filter((b) => b.spent > EPS);
  if (bought.length === 0) return null;

  const first = points[0];
  const invested = last.invested;
  const lumpValue = (invested / first.price) * priceToday;
  const lumpSum = {
    date: first.date,
    invested,
    value: lumpValue,
    gain: lumpValue - invested,
    gainPct: invested > 0 ? ((lumpValue - invested) / invested) * 100 : 0,
    dcaValue: last.value,
    dcaMinusLump: last.value - lumpValue,
  };

  const fact = (b: { p: GrowthPoint; spent: number }): BuyFact => ({ date: b.p.date, price: b.p.price, nowValue: b.spent * (priceToday / b.p.price), multiple: priceToday / b.p.price });
  const best = fact(bought.reduce((a, b) => (b.p.price < a.p.price ? b : a)));
  const worst = fact(bought.reduce((a, b) => (b.p.price > a.p.price ? b : a)));

  // Biggest peak-to-trough fall in the price across the run.
  let peak = points[0];
  let drop: Insights["drop"] = null;
  for (const p of points) {
    if (p.price > peak.price) peak = p;
    const pct = (peak.price - p.price) / peak.price;
    if (pct > (drop ? drop.pct / 100 : 0.0001)) drop = { pct: pct * 100, from: peak.date, to: p.date };
  }

  // Longest stretch of consecutive points below break-even.
  let underwater: Insights["underwater"] = null;
  let runStart = -1;
  for (let i = 0; i <= points.length; i++) {
    const under = i < points.length && points[i].value < points[i].invested - EPS;
    if (under && runStart < 0) runStart = i;
    if (!under && runStart >= 0) {
      const a = points[runStart];
      const b = points[i - 1];
      const months = Math.max(1, Math.round((b.t - a.t) / MONTH_MS) + 1);
      if (!underwater || months > underwater.months) underwater = { months, from: a.date, to: b.date, still: i === points.length };
      runStart = -1;
    }
  }

  return { lumpSum, best, worst, drop, underwater };
}
