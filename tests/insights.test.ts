import assert from "node:assert/strict";
import { test } from "node:test";
import type { GrowthPoint } from "../src/lib/charts.ts";
import { computeInsights, monthYear } from "../src/lib/insights.ts";

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/** Builds the series the chart uses: $100 a month at the given prices, plus a final "today" point. */
function series(prices: number[], today: number, start = "2020-01"): GrowthPoint[] {
  const out: GrowthPoint[] = [];
  let units = 0;
  const [y, m] = start.split("-").map(Number);
  prices.forEach((price, i) => {
    units += 100 / price;
    const d = new Date(Date.UTC(y, m - 1 + i, 28));
    const date = d.toISOString().slice(0, 10);
    out.push({ t: day(date), date, invested: 100 * (i + 1), value: units * price, price, avgCost: (100 * (i + 1)) / units });
  });
  const last = out[out.length - 1];
  const date = new Date(Date.UTC(y, m - 1 + prices.length, 28)).toISOString().slice(0, 10);
  out.push({ t: day(date), date, invested: last.invested, value: units * today, price: today, avgCost: last.avgCost });
  return out;
}

test("nothing to say with fewer than two points", () => {
  assert.equal(computeInsights([], 100), null);
  assert.equal(computeInsights(series([10], 12).slice(0, 1), 100), null);
});

test("lump sum: the same total put in on day one, valued at today's price", () => {
  const i = computeInsights(series([10, 20, 40], 80), 100)!;
  // $300 in at $10 = 30 units, worth $2,400 at $80
  assert.equal(i.lumpSum.invested, 300);
  assert.equal(Math.round(i.lumpSum.value), 2400);
  assert.equal(Math.round(i.lumpSum.gainPct), 700);
  // monthly: 10 + 5 + 2.5 = 17.5 units, worth $1,400
  assert.equal(Math.round(i.lumpSum.dcaValue), 1400);
  assert.equal(Math.round(i.lumpSum.dcaMinusLump), -1000, "buying monthly trailed here because the price only rose");
});

test("in a falling market buying monthly beats buying all at once", () => {
  const i = computeInsights(series([40, 20, 10], 10), 100)!;
  assert.ok(i.lumpSum.dcaMinusLump > 0);
});

test("best and worst buy are the cheapest and dearest, with what each is worth today", () => {
  const i = computeInsights(series([50, 25, 100, 80], 100), 200)!;
  assert.equal(i.best.price, 25);
  assert.equal(i.best.multiple, 4);
  assert.equal(i.best.nowValue, 400, "what that $100 buy cost, times 4 (the series buys $100 a month)");
  assert.equal(i.worst.price, 100);
  assert.equal(i.worst.multiple, 1);
});

test("the today point is not counted as a purchase", () => {
  const i = computeInsights(series([10, 10], 1), 100)!;
  assert.equal(i.worst.price, 10, "the 'today' price of 1 is not a buy");
  assert.equal(i.best.price, 10);
});

test("biggest drop is peak to trough in the price", () => {
  const i = computeInsights(series([10, 20, 10, 5, 8], 9), 100)!;
  assert.ok(i.drop);
  assert.equal(Math.round(i.drop.pct), 75);
  assert.equal(monthYear(i.drop.from), "Feb 2020");
  assert.equal(monthYear(i.drop.to), "Apr 2020");
});

test("a price that only rises has no drop and never goes underwater", () => {
  const i = computeInsights(series([10, 11, 12, 13], 14), 100)!;
  assert.equal(i.drop, null);
  assert.equal(i.underwater, null);
});

test("longest underwater stretch, and whether it is still going", () => {
  const ended = computeInsights(series([10, 5, 5, 4, 20, 30], 30), 100)!;
  assert.ok(ended.underwater);
  assert.equal(ended.underwater.still, false);
  assert.ok(ended.underwater.months >= 3);
  const still = computeInsights(series([10, 12, 8, 6], 5), 100)!;
  assert.ok(still.underwater);
  assert.equal(still.underwater.still, true);
});

test("month names read like a person writes them", () => {
  assert.equal(monthYear("2020-03-31"), "Mar 2020");
});

test("thinTicks keeps evenly spaced ticks and never leaves more than asked", async () => {
  const { thinTicks } = await import("../src/lib/charts.ts");
  assert.deepEqual(thinTicks([1, 2, 3, 4, 5, 6], 3), [1, 3, 5]);
  assert.deepEqual(thinTicks([1, 2, 3], 5), [1, 2, 3]);
  assert.deepEqual(thinTicks([1, 2, 3, 4, 5, 6, 7], 1), [1, 5]);
});
