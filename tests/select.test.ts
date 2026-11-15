import assert from "node:assert/strict";
import { test } from "node:test";
import { monthsBetween, targetDate } from "../src/lib/months.ts";
import { findNearest, selectMonthPrice, type SelectOptions } from "../src/lib/select.ts";
import type { DailyPoint } from "../src/lib/types.ts";

const map = (pts: DailyPoint[]) => new Map(pts.map((p) => [p.date, p]));
const opts = (over: Partial<SelectOptions> = {}): SelectOptions => ({
  basis: "month-end",
  source: "CoinGecko",
  today: "2026-11-13",
  earliestAllowed: null,
  ...over,
});

test("targetDate: month-end handles 28/29/30/31-day months", () => {
  assert.equal(targetDate("2025-02", "month-end"), "2025-02-28");
  assert.equal(targetDate("2024-02", "month-end"), "2024-02-29");
  assert.equal(targetDate("2025-04", "month-end"), "2025-04-30");
  assert.equal(targetDate("2025-12", "month-end"), "2025-12-31");
  assert.equal(targetDate("2025-12", "first-of-month"), "2025-12-01");
});

test("targetDate: day-of-month clamps to month length", () => {
  assert.equal(targetDate("2025-02", "day-of-month", 31), "2025-02-28");
  assert.equal(targetDate("2024-02", "day-of-month", 31), "2024-02-29");
  assert.equal(targetDate("2025-04", "day-of-month", 31), "2025-04-30");
  assert.equal(targetDate("2025-01", "day-of-month", 15), "2025-01-15");
  assert.equal(targetDate("2025-01", "day-of-month", 31), "2025-01-31");
});

test("day-of-month basis picks the clamped calendar day", () => {
  const row = selectMonthPrice(
    "2025-02",
    map([{ date: "2025-02-28", price: 4 }]),
    opts({ basis: "day-of-month", basisDay: 31 }),
  );
  assert.equal(row.targetDate, "2025-02-28");
  assert.equal(row.price, 4);
});

test("monthsBetween is inclusive and crosses years", () => {
  assert.deepEqual(monthsBetween("2024-11", "2025-02"), ["2024-11", "2024-12", "2025-01", "2025-02"]);
  assert.equal(monthsBetween("2024-12", "2026-10").length, 23);
});

test("exact day is used with no note", () => {
  const row = selectMonthPrice("2025-01", map([{ date: "2025-01-31", price: 2 }]), opts());
  assert.equal(row.price, 2);
  assert.equal(row.priceDate, "2025-01-31");
  assert.equal(row.notes.length, 0);
});

test("gap: nearest day within 3 days is used and noted with the day used", () => {
  const row = selectMonthPrice("2025-01", map([{ date: "2025-01-29", price: 5 }]), opts());
  assert.equal(row.price, 5);
  assert.equal(row.priceDate, "2025-01-29");
  assert.equal(row.notes[0].code, "nearest-day");
  assert.match(row.notes[0].text, /2025-01-29/);
});

test("gap wider than 3 days gives n/a, never a guess", () => {
  const row = selectMonthPrice("2025-01", map([{ date: "2025-01-27", price: 5 }]), opts());
  assert.equal(row.price, null);
  assert.equal(row.priceDate, null);
  assert.equal(row.notes[0].code, "no-data");
});

test("tie between earlier and later day prefers the earlier day", () => {
  const p = findNearest(
    map([
      { date: "2025-01-14", price: 1 },
      { date: "2025-01-16", price: 2 },
    ]),
    "2025-01-15",
  );
  assert.equal(p?.price, 1);
});

test("future target is n/a", () => {
  const row = selectMonthPrice("2026-11", map([{ date: "2026-11-13", price: 1 }]), opts());
  assert.equal(row.price, null);
  assert.equal(row.notes[0].code, "future");
});

test("target before free-tier window is out-of-range when no source has a price near it", () => {
  const row = selectMonthPrice("2024-12", map([]), opts({ earliestAllowed: "2025-11-14" }));
  assert.equal(row.price, null);
  assert.equal(row.notes[0].code, "out-of-range");
});

test("older data from another source is used even before the free window", () => {
  const row = selectMonthPrice(
    "2024-12",
    map([{ date: "2024-12-31", price: 1, source: "GeckoTerminal" }]),
    opts({ earliestAllowed: "2025-11-14" }),
  );
  assert.equal(row.price, 1);
  assert.equal(row.source, "GeckoTerminal", "a point's own source beats the run's default");
});

test("low volume is flagged", () => {
  const row = selectMonthPrice("2025-01", map([{ date: "2025-01-31", price: 1, volume: 40 }]), opts());
  assert.equal(row.price, 1);
  assert.ok(row.notes.some((n) => n.code === "low-volume"));
});

test("price far from adjacent days is flagged as outlier", () => {
  const pts: DailyPoint[] = [
    { date: "2025-01-28", price: 1 },
    { date: "2025-01-29", price: 1.02 },
    { date: "2025-01-30", price: 0.98 },
    { date: "2025-01-31", price: 3 },
    { date: "2025-02-01", price: 1.01 },
  ];
  const row = selectMonthPrice("2025-01", map(pts), opts());
  assert.ok(row.notes.some((n) => n.code === "outlier"));
});

test("steady prices are not flagged", () => {
  const pts: DailyPoint[] = [
    { date: "2025-01-29", price: 1 },
    { date: "2025-01-30", price: 1.05 },
    { date: "2025-01-31", price: 1.1, volume: 50000 },
  ];
  assert.equal(selectMonthPrice("2025-01", map(pts), opts()).notes.length, 0);
});

test("first-of-month basis picks the 1st", () => {
  const row = selectMonthPrice(
    "2025-03",
    map([
      { date: "2025-03-01", price: 7 },
      { date: "2025-03-31", price: 9 },
    ]),
    opts({ basis: "first-of-month" }),
  );
  assert.equal(row.price, 7);
});
