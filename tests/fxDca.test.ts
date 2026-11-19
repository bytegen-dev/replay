import assert from "node:assert/strict";
import { test } from "node:test";
import type { FxPoint } from "../src/lib/fx.ts";
import { runFxDca } from "../src/lib/fxDca.ts";

const pt = (date: string, perUsd: number): FxPoint => ({ date, perUsd });
// Naira per dollar at the end of three months, then today.
const ngn = [pt("2020-01-31", 100), pt("2020-02-29", 200), pt("2020-03-31", 400), pt("2020-04-15", 500)];

test("naira into dollars: each month buys fewer dollars as the naira weakens, and the dollars are worth more naira today", () => {
  const r = runFxDca({ from: "NGN", to: "USD", amount: 1000, startMonth: "2020-01", endMonth: "2020-03" }, ngn, [], "2020-04-15");
  // 1000/100 + 1000/200 + 1000/400 = 10 + 5 + 2.5 dollars
  assert.equal(r.pricedMonths, 3);
  assert.equal(r.spent, 3000);
  assert.equal(r.held, 17.5);
  assert.equal(+r.averageRate!.toFixed(4), +(3000 / 17.5).toFixed(4));
  assert.equal(r.rateToday, 500);
  assert.equal(r.valueToday, 8750, "17.5 dollars at 500 naira each");
  assert.equal(r.gain, 5750);
  assert.equal(Math.round(r.gainPct!), 192);
  // all 3,000 on day one: 30 dollars, worth 15,000 naira today
  assert.equal(r.lumpSumValue, 15000);
});

test("a rate between two non-dollar currencies goes through the dollar", () => {
  const gbp = [pt("2020-01-31", 0.8)];
  // 1 USD = 100 NGN = 0.8 GBP, so 1 GBP = 125 NGN: 1,250 NGN buys 10 GBP
  const r = runFxDca({ from: "NGN", to: "GBP", amount: 1250, startMonth: "2020-01", endMonth: "2020-01" }, ngn, gbp, "2020-01-31");
  assert.equal(r.rows[0].rate, 125);
  assert.equal(r.rows[0].bought, 10);
});

test("months with no rate are left out of the totals, never guessed", () => {
  const r = runFxDca({ from: "NGN", to: "USD", amount: 1000, startMonth: "2019-11", endMonth: "2020-01" }, ngn, [], "2020-04-15");
  assert.equal(r.months, 3);
  assert.equal(r.pricedMonths, 1);
  assert.equal(r.rows[0].rate, null);
  assert.equal(r.spent, 1000);
});

test("the current month uses today's date, and the flat dollar series is never needed", () => {
  const r = runFxDca({ from: "NGN", to: "USD", amount: 1000, startMonth: "2020-04", endMonth: "2020-04" }, ngn, [], "2020-04-15");
  assert.equal(r.rows[0].date, "2020-04-15");
  assert.equal(r.rows[0].rate, 500);
});
