import assert from "node:assert/strict";
import { test } from "node:test";
import { findNearest, selectMonthPrice, type SelectOptions } from "../src/lib/select.ts";
import type { DailyPoint } from "../src/lib/types.ts";

const map = (pts: DailyPoint[]) => new Map(pts.map((p) => [p.date, p]));
const opts = (over: Partial<SelectOptions> = {}): SelectOptions => ({ basis: "month-end", source: "CoinGecko", today: "2026-11-13", earliestAllowed: null, ...over });
const sparse = (date: string, price = 1): DailyPoint => ({ date, price, source: "GeckoTerminal", sparse: true });
const normal = (date: string, price = 1): DailyPoint => ({ date, price });

test("a thin-pool trade up to 7 days away stands in when nothing is within 3 days", () => {
  // The NMKR case: the pool traded on Oct 27 and next on Nov 4, nothing within 3 days of Oct 31.
  const byDate = map([sparse("2025-10-27", 7), sparse("2025-11-04", 9)]);
  assert.equal(findNearest(byDate, "2025-10-31")?.date, "2025-10-27", "the earlier trade wins a 4-4 tie");
});

test("the 3-day rule still applies first, and normal sources never stretch past it", () => {
  assert.equal(findNearest(map([sparse("2025-10-27"), sparse("2025-10-30")]), "2025-10-31")?.date, "2025-10-30", "a closer trade beats a farther one");
  assert.equal(findNearest(map([normal("2025-10-27")]), "2025-10-31"), null, "non-sparse data stays within 3 days");
  assert.equal(findNearest(map([sparse("2025-10-23")]), "2025-10-31"), null, "8 days is too far even for a thin pool");
  assert.equal(findNearest(map([sparse("2025-10-24")]), "2025-10-31")?.date, "2025-10-24", "7 days is the limit");
});

test("a stretched match says so plainly, with how far and which way", () => {
  const row = selectMonthPrice("2025-10", map([sparse("2025-10-27", 7)]), opts());
  assert.equal(row.price, 7);
  assert.equal(row.priceDate, "2025-10-27");
  assert.equal(row.source, "GeckoTerminal");
  const note = row.notes.find((n) => n.code === "nearest-day");
  assert.ok(note);
  assert.match(note.text, /No trade within 3 days of 2025-10-31/);
  assert.match(note.text, /2025-10-27 \(4 days earlier\)/);

  const later = selectMonthPrice("2025-10", map([sparse("2025-11-05", 8)]), opts());
  assert.match(later.notes.find((n) => n.code === "nearest-day")?.text ?? "", /5 days later/);
});

test("a close match keeps the short note", () => {
  const row = selectMonthPrice("2025-10", map([sparse("2025-10-29")]), opts());
  assert.equal(row.notes.find((n) => n.code === "nearest-day")?.text, "No price on 2025-10-31; used 2025-10-29");
});
