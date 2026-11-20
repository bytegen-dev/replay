import assert from "node:assert/strict";
import { test } from "node:test";
import { GOLD_ENDS, GOLD_STARTS, goldPrice } from "../src/lib/gold.ts";

test("gold has a price for every month from its first one to its last", () => {
  const [y0, m0] = GOLD_STARTS.split("-").map(Number);
  const [y1, m1] = GOLD_ENDS.split("-").map(Number);
  for (let n = y0 * 12 + (m0 - 1); n <= y1 * 12 + (m1 - 1); n++) {
    const ym = `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
    const p = goldPrice(ym);
    assert.ok(typeof p === "number" && p > 100 && p < 20000, `${ym}: ${p}`);
  }
});

test("months before the list starts have no price, and months after its end take the latest", () => {
  assert.equal(goldPrice("1998-06"), null);
  assert.equal(goldPrice("2000-07"), null);
  assert.equal(goldPrice("2100-01"), goldPrice(GOLD_ENDS));
  assert.equal(goldPrice("nonsense"), null);
});

test("a known month reads about right", () => {
  // Gold closed 2008 near $870 and 2011 near $1,530.
  const a = goldPrice("2008-12");
  const b = goldPrice("2011-12");
  assert.ok(a !== null && a > 780 && a < 960, String(a));
  assert.ok(b !== null && b > 1400 && b < 1650, String(b));
});
