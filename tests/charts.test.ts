import assert from "node:assert/strict";
import { test } from "node:test";
import { formatChartTime, growthSeries, moneyShort, niceScale, timeTicks } from "../src/lib/charts.ts";
import { buildBuys } from "../src/lib/math.ts";
import type { MonthRow } from "../src/lib/types.ts";

const row = (month: string, price: number | null, priceDate?: string): MonthRow => ({
  month,
  targetDate: `${month}-28`,
  priceDate: price === null ? null : (priceDate ?? `${month}-28`),
  price,
  source: price === null ? "none" : "CoinGecko",
  notes: [],
});
const utc = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);

test("growth: each point is what the units held then were worth at that day's price", () => {
  // $100 a month; the price doubles, then halves.
  const buys = buildBuys([row("2025-01", 10), row("2025-02", 20), row("2025-03", 10)], 100, 40, {}, 6);
  const g = growthSeries(buys, 40, "2025-06-01");
  assert.equal(g.length, 4, "three purchases and today");
  assert.deepEqual(g.map((p) => p.invested), [100, 200, 300, 300]);
  assert.equal(g[0].value, 100, "10 units at $10");
  assert.equal(g[1].value, 15 * 20, "15 units at $20, not valued at today's price");
  assert.equal(g[2].value, 25 * 10);
  assert.equal(g[3].value, 25 * 40, "today: all 25 units at $40");
  assert.equal(g[3].invested, 300, "buying nothing today adds nothing");
  assert.ok(Math.abs(g[2].avgCost - 12) < 1e-9, "$300 over 25 units");
});

test("growth: months with no price were never bought and get no point", () => {
  const buys = buildBuys([row("2025-01", 10), row("2025-02", null), row("2025-03", 10)], 100, 10, {}, 6);
  const g = growthSeries(buys, 10, "2025-04-01");
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((p) => p.invested), [100, 200, 200]);
});

test("growth: a manual price (no price date) falls back to the purchase date; today is skipped if it is not later", () => {
  const buys = buildBuys([row("2025-01", null)], 100, 10, { "2025-01": 5 }, 6);
  const g = growthSeries(buys, 10, "2025-02-10");
  assert.equal(g.length, 2);
  assert.equal(g[0].date, "2025-01-28");
  assert.equal(growthSeries(buys, 10, "2025-01-10").length, 1, "a 'today' before the last purchase is not appended");
  const same = growthSeries(buys, 10, "2025-01-28");
  assert.equal(same.length, 1, "today is the same day as the last purchase, so no duplicate point");
  assert.deepEqual(growthSeries([], 10, "2025-01-01"), []);
  assert.equal(growthSeries(buildBuys([row("2025-01", 10)], 100, null, {}, 6), null, null).length, 1, "no current price, no final point");
});

test("value axis: round ticks that cover the data, anchored at zero for money", () => {
  const s = niceScale(0, 119_172, true);
  assert.deepEqual(s.ticks, [0, 50_000, 100_000, 150_000]);
  assert.equal(s.lo, 0);
  assert.equal(s.hi, 150_000);
  assert.deepEqual(niceScale(0, 9, true).ticks, [0, 2.5, 5, 7.5, 10]);
  assert.deepEqual(niceScale(0, 1, true, 4).ticks, [0, 0.25, 0.5, 0.75, 1]);
});

test("value axis: a price that hugs its range, and tiny prices keep clean ticks", () => {
  const s = niceScale(3.7e-6, 4.6e-6, false);
  assert.ok(s.lo <= 3.7e-6 && s.hi >= 4.6e-6);
  assert.ok(s.ticks.length >= 3);
  for (const t of s.ticks) assert.equal(t, Number(t.toPrecision(10)), "no floating-point dust like 4.000000000001e-6");
  const flat = niceScale(5, 5, false);
  assert.ok(flat.lo < 5 && flat.hi > 5, "a flat line gets air above and below");
  assert.deepEqual(niceScale(0, 0, true).ticks.length >= 2, true);
});

test("money in short form", () => {
  assert.equal(moneyShort(0), "$0");
  assert.equal(moneyShort(7.5), "$7.5");
  assert.equal(moneyShort(250), "$250");
  assert.equal(moneyShort(1_500), "$1.5K");
  assert.equal(moneyShort(12_000), "$12K");
  assert.equal(moneyShort(119_172), "$119K");
  assert.equal(moneyShort(1_400_000), "$1.4M");
  assert.equal(moneyShort(3_200_000_000), "$3.2B");
  assert.equal(moneyShort(-2_500), "-$2.5K");
  assert.equal(moneyShort(Number.NaN), "n/a");
});

test("time axis: years for decades, months for a year, days, hours, minutes", () => {
  const years = timeTicks(utc(1998, 1, 31), utc(2026, 10, 31), 6);
  assert.deepEqual(years.map((t) => t.label), ["2000", "2005", "2010", "2015", "2020", "2025"].slice(0, years.length));
  assert.ok(years.length <= 6 && years.length >= 3);

  const months = timeTicks(utc(2025, 11, 20), utc(2026, 10, 31), 6);
  assert.ok(months.length >= 3 && months.length <= 6);
  assert.ok(months.every((t) => /^[A-Z][a-z]{2} 20\d\d$/.test(t.label)));
  assert.ok(months.every((t) => new Date(t.t).getUTCDate() === 1), "months tick on the 1st");

  const days = timeTicks(utc(2026, 11, 5), utc(2026, 11, 19), 6);
  assert.ok(days.every((t) => /^\d{1,2} Nov$/.test(t.label)));
  assert.ok(days.length >= 3);

  const hours = timeTicks(utc(2026, 11, 18, 2, 30), utc(2026, 11, 18, 13, 40), 6);
  assert.ok(hours.every((t) => /^\d\d:00$/.test(t.label)));
  assert.ok(hours.length >= 3 && hours.length <= 6);

  const minutes = timeTicks(utc(2026, 11, 18, 11, 40), utc(2026, 11, 18, 13, 40), 6);
  assert.ok(minutes.every((t) => /^\d\d:\d\d$/.test(t.label)));
  assert.equal(timeTicks(100, 100).length, 0);
});

test("ticks stay inside the range and run in order", () => {
  for (const [a, b] of [[utc(2013, 1, 1), utc(2026, 10, 31)], [utc(2025, 1, 15), utc(2026, 3, 2)], [utc(2026, 11, 1), utc(2026, 11, 9)]] as const) {
    const t = timeTicks(a, b);
    assert.ok(t.every((x, i) => x.t >= a && x.t <= b && (i === 0 || x.t > t[i - 1].t)));
  }
});

test("chart times read plainly", () => {
  assert.equal(formatChartTime(utc(2026, 9, 15), false), "15 Sep 2026");
  assert.equal(formatChartTime(utc(2026, 9, 15, 13, 40), true), "15 Sep 2026, 13:40 UTC");
});
