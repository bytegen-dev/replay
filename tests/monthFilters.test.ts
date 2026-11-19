import assert from "node:assert/strict";
import { test } from "node:test";
import type { BuyRow } from "../src/lib/math.ts";
import { applyMonthFilters, isFiltered, NO_FILTER, yearsIn, type MonthFilter } from "../src/lib/monthFilters.ts";

const row = (month: string, price: number | null, extra: Partial<BuyRow> = {}): BuyRow =>
  ({
    month,
    targetDate: `${month}-28`,
    priceDate: price === null ? null : `${month}-28`,
    price,
    source: "Yahoo",
    notes: [],
    amount: price === null ? 0 : 100,
    tokens: price === null ? null : 100 / price,
    valueToday: price === null ? null : (100 / price) * 50,
    manual: false,
    ...extra,
  }) as BuyRow;

const buys = [row("2023-01", 10), row("2023-02", null), row("2024-01", 100), row("2024-02", 40, { notes: [{ code: "nearest-day", text: "x" }] }), row("2025-01", 25, { manual: true })];
const f = (p: Partial<MonthFilter>): MonthFilter => ({ ...NO_FILTER, ...p });
const months = (l: BuyRow[]) => l.map((b) => b.month);

test("no filter keeps everything, oldest first", () => {
  assert.deepEqual(months(applyMonthFilters(buys, NO_FILTER)), ["2023-01", "2023-02", "2024-01", "2024-02", "2025-01"]);
  assert.equal(isFiltered(NO_FILTER), false);
  assert.equal(isFiltered(f({ hideNoPrice: true })), true);
});

test("hide months with no price, and pick a year", () => {
  assert.deepEqual(months(applyMonthFilters(buys, f({ hideNoPrice: true }))), ["2023-01", "2024-01", "2024-02", "2025-01"]);
  assert.deepEqual(months(applyMonthFilters(buys, f({ year: "2024" }))), ["2024-01", "2024-02"]);
});

test("only months with notes, and only edited prices", () => {
  assert.deepEqual(months(applyMonthFilters(buys, f({ onlyNotes: true }))), ["2024-02"]);
  assert.deepEqual(months(applyMonthFilters(buys, f({ onlyEdited: true }))), ["2025-01"]);
});

test("profit and loss compare what a buy is worth today with what was put in", () => {
  // value today = (100 / price) * 50: price 10 -> 500 (profit), 100 -> 50 (loss), 40 -> 125 (profit), 25 -> 200 (profit)
  assert.deepEqual(months(applyMonthFilters(buys, f({ result: "loss" }))), ["2024-01"]);
  assert.deepEqual(months(applyMonthFilters(buys, f({ result: "profit" }))), ["2023-01", "2024-02", "2025-01"]);
});

test("price range, with commas and dollar signs tolerated, leaves out months with no price", () => {
  assert.deepEqual(months(applyMonthFilters(buys, f({ minPrice: "$20", maxPrice: "50" }))), ["2024-02", "2025-01"]);
  assert.deepEqual(months(applyMonthFilters(buys, f({ minPrice: "1,000" }))), []);
  assert.deepEqual(months(applyMonthFilters(buys, f({ maxPrice: "abc" }))), months(buys), "a bad number is no limit");
});

test("sorting: price orders put months with no price last", () => {
  assert.deepEqual(months(applyMonthFilters(buys, f({ sort: "price-asc" }))), ["2023-01", "2025-01", "2024-02", "2024-01", "2023-02"]);
  assert.deepEqual(months(applyMonthFilters(buys, f({ sort: "price-desc" }))), ["2024-01", "2024-02", "2025-01", "2023-01", "2023-02"]);
  assert.deepEqual(months(applyMonthFilters(buys, f({ sort: "month-desc" }))), ["2025-01", "2024-02", "2024-01", "2023-02", "2023-01"]);
  assert.equal(months(applyMonthFilters(buys, f({ sort: "value-desc" })))[0], "2023-01");
});

test("filters combine, and the list of years is newest first", () => {
  assert.deepEqual(months(applyMonthFilters(buys, f({ year: "2024", result: "profit" }))), ["2024-02"]);
  assert.deepEqual(yearsIn(buys), ["2025", "2024", "2023"]);
});
