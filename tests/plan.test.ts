import assert from "node:assert/strict";
import { test } from "node:test";
import { growthSeries } from "../src/lib/charts.ts";
import { buildBuys, summarize } from "../src/lib/math.ts";
import { countBuys, describePlan, isBuyMonth } from "../src/lib/plan.ts";
import type { MonthRow } from "../src/lib/types.ts";

const row = (month: string, price: number | null): MonthRow => ({ month, targetDate: `${month}-28`, priceDate: price === null ? null : `${month}-28`, price, source: price === null ? "none" : "Yahoo", notes: [] });
const rows = [row("2020-01", 10), row("2020-02", 20), row("2020-03", 40), row("2020-04", 80), row("2020-05", 100), row("2020-06", 50), row("2020-07", 25)];

test("plans pick buying months counted from the start month", () => {
  assert.deepEqual(rows.map((r) => isBuyMonth("quarterly", "2020-01", r.month)), [true, false, false, true, false, false, true]);
  assert.deepEqual(rows.map((r) => isBuyMonth("once", "2020-01", r.month)), [true, false, false, false, false, false, false]);
  assert.ok(isBuyMonth("monthly", "2020-01", "2020-05"));
  assert.ok(!isBuyMonth("monthly", "2020-03", "2020-01"));
  assert.equal(countBuys("quarterly", "2020-01", "2020-07"), 3);
  assert.equal(countBuys("once", "2020-01", "2026-10"), 1);
  assert.equal(countBuys("yearly", "2016-11", "2026-10"), 10);
  assert.equal(countBuys(undefined, "2020-01", "2020-07"), 7);
});

test("a single buy puts everything in at the start and the holding follows the price", () => {
  const buys = buildBuys(rows, 1000, 25, {}, 6, "once");
  const s = summarize(buys, 25);
  assert.equal(s.invested, 1000);
  assert.equal(s.tokens, 100); // 1000 / 10
  assert.equal(s.pricedMonths, 1);
  assert.equal(s.valueToday, 2500);
  // The chart still gets a point for every priced month, with the money in staying put and the value moving.
  const pts = growthSeries(buys, 25, "2020-07-28");
  assert.deepEqual(pts.map((p) => p.invested), [1000, 1000, 1000, 1000, 1000, 1000, 1000]);
  assert.deepEqual(pts.map((p) => p.value), [1000, 2000, 4000, 8000, 10000, 5000, 2500]);
});

test("every 3 months buys in the start month and every third after it; skipped buys are only buying months", () => {
  const withGap = rows.map((r) => (r.month === "2020-04" ? row("2020-04", null) : r));
  const buys = buildBuys(withGap, 100, 25, {}, 6, "quarterly");
  const s = summarize(buys, 25);
  assert.equal(s.pricedMonths, 2, "January and July bought; April is a buying month with no price");
  assert.equal(s.skippedMonths, 1);
  assert.deepEqual(s.skipped, ["2020-04"]);
  assert.equal(s.invested, 200);
});

test("the plan reads naturally in a sentence", () => {
  assert.equal(describePlan("monthly", "$500", 120, 120, 0), "$500 a month for 120 months");
  assert.equal(describePlan("quarterly", "$500", 39, 40, 1), "$500 every 3 months for 39 of 40 buys");
  assert.equal(describePlan("once", "$5,000", 1, 1, 0), "$5,000 once");
});

test("a single buy moves forward to the first month with a price, and says so", () => {
  const gap = [row("2020-01", null), row("2020-02", null), row("2020-03", 40), row("2020-04", 80)];
  const buys = buildBuys(gap, 1000, 80, {}, 6, "once");
  const s = summarize(buys, 80);
  assert.equal(s.pricedMonths, 1);
  assert.equal(s.skippedMonths, 0, "the unpriced start months are not counted as missed buys");
  assert.equal(s.invested, 1000);
  assert.equal(s.tokens, 25); // 1000 / 40, bought in March
  assert.equal(buys[2].buy, undefined);
  assert.ok(buys[2].notes.some((n) => n.code === "shifted"));
  assert.equal(buys[0].buy, false);
  assert.equal(buys[1].buy, false);
  // never backwards: with a priced start month it stays put and carries no note
  const normal = buildBuys(rows, 1000, 25, {}, 6, "once");
  assert.equal(normal[0].notes.length, 0);
  assert.equal(summarize(normal, 25).tokens, 100);
});

test("with no priced month at all, a single buy is skipped, not guessed", () => {
  const none = [row("2020-01", null), row("2020-02", null)];
  const s = summarize(buildBuys(none, 1000, null, {}, 6, "once"), null);
  assert.equal(s.invested, 0);
  assert.equal(s.skippedMonths, 1);
});
