import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBuys, chooseDecimals, summarize, tokensBought } from "../src/lib/math.ts";
import type { MonthRow } from "../src/lib/types.ts";

const row = (month: string, price: number | null): MonthRow => ({
  month,
  targetDate: `${month}-28`,
  priceDate: price === null ? null : `${month}-28`,
  price,
  source: price === null ? "none" : "CoinGecko",
  notes: [],
});

test("tokensBought rounds like Excel ROUND(amount/price, 0)", () => {
  assert.equal(tokensBought(200, 0.03, 0), 6667);
  assert.equal(tokensBought(200, 0.3, 0), 667);
  assert.equal(tokensBought(100, 8, 0), 13); // 12.5 rounds half up
  assert.equal(tokensBought(200, 3000, 6), 0.066667);
});

test("chooseDecimals keeps 0 for cheap tokens, 6 when a buy would be under 100 tokens", () => {
  assert.equal(chooseDecimals([{ price: 0.05 }, { price: null }], 200), 0);
  assert.equal(chooseDecimals([{ price: 3000 }], 200), 6);
});

test("totals exclude n/a months", () => {
  const rows = [row("2025-01", 0.1), row("2025-02", null), row("2025-03", 0.2)];
  const buys = buildBuys(rows, 200, 0.25, {}, 0);
  const s = summarize(buys, 0.25);
  assert.equal(s.invested, 400);
  assert.equal(s.tokens, 2000 + 1000);
  assert.equal(s.skippedMonths, 1);
  assert.deepEqual(s.skipped, ["2025-02"]);
  assert.equal(s.valueToday, 3000 * 0.25);
  assert.equal(s.gain, 750 - 400);
  assert.ok(Math.abs((s.gainPct ?? 0) - 87.5) < 1e-9);
  assert.ok(Math.abs((s.avgPrice ?? 0) - 400 / 3000) < 1e-12);
});

test("manual override replaces price, is marked manual, and fills an n/a month", () => {
  const rows = [row("2025-01", 0.1), row("2025-02", null)];
  const buys = buildBuys(rows, 200, 1, { "2025-01": 0.5, "2025-02": 0.4 }, 0);
  assert.equal(buys[0].tokens, 400);
  assert.equal(buys[0].source, "manual");
  assert.equal(buys[0].manual, true);
  assert.equal(buys[1].tokens, 500);
  assert.equal(summarize(buys, 1).invested, 400);
});

test("invalid override (0 / negative) is ignored", () => {
  const buys = buildBuys([row("2025-01", 0.1)], 200, 1, { "2025-01": 0 }, 0);
  assert.equal(buys[0].manual, false);
  assert.equal(buys[0].tokens, 2000);
});

test("summary with everything n/a has no average and no gain", () => {
  const s = summarize(buildBuys([row("2025-01", null)], 200, 1, {}, 0), 1);
  assert.equal(s.invested, 0);
  assert.equal(s.avgPrice, null);
  assert.equal(s.gainPct, null);
});

test("missing current price leaves value and gain null", () => {
  const s = summarize(buildBuys([row("2025-01", 0.1)], 200, null, {}, 0), null);
  assert.equal(s.valueToday, null);
  assert.equal(s.gain, null);
});
