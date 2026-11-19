import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAmount, decodeRange, encodeRange } from "../src/lib/urlState.ts";
import { filterCurrencies } from "../src/lib/fxCurrencies.ts";

test("a range ending last month is stored as a length and restored relative to last month", () => {
  assert.deepEqual(encodeRange("2016-11", "2026-10", "2026-10"), { range: "10y" });
  assert.deepEqual(encodeRange("2026-01", "2026-10", "2026-10"), { range: "10m" });
  assert.deepEqual(decodeRange(new URLSearchParams("range=10y"), "2026-12"), { start: "2017-01", end: "2026-12" });
});

test("a range that ends elsewhere keeps its exact months; junk is ignored", () => {
  assert.deepEqual(encodeRange("2010-01", "2015-06", "2026-10"), { from: "2010-01", to: "2015-06" });
  assert.deepEqual(decodeRange(new URLSearchParams("from=2010-01&to=2015-06"), "2026-10"), { start: "2010-01", end: "2015-06" });
  assert.equal(decodeRange(new URLSearchParams("range=9999y"), "2026-10"), null);
  assert.equal(decodeRange(new URLSearchParams("from=2015-06&to=2010-01"), "2026-10"), null);
  assert.equal(cleanAmount("500"), "500");
  assert.equal(cleanAmount("-5"), null);
  assert.equal(cleanAmount("1e9"), null);
});

test("currency search finds by code, name word or symbol", () => {
  assert.equal(filterCurrencies("naira")[0].code, "NGN");
  assert.equal(filterCurrencies("ngn")[0].code, "NGN");
  assert.ok(filterCurrencies("south").some((c) => c.code === "ZAR"));
  assert.equal(filterCurrencies("₦")[0].code, "NGN");
  assert.equal(filterCurrencies("").length > 40, true);
});

test("amounts typed with commas or spaces still count", async () => {
  const { parseAmount } = await import("../src/lib/urlState.ts");
  assert.equal(parseAmount("500,000"), 500000);
  assert.equal(parseAmount("1 500.50"), 1500.5);
  assert.ok(Number.isNaN(parseAmount("abc")));
  assert.ok(Number.isNaN(parseAmount("")));
  assert.equal(cleanAmount("500,000"), "500000");
});

test("typed amounts get commas as they grow", async () => {
  const { formatAmountInput } = await import("../src/lib/urlState.ts");
  assert.equal(formatAmountInput("500000"), "500,000");
  assert.equal(formatAmountInput("1,2345"), "12,345");
  assert.equal(formatAmountInput("1234567.5"), "1,234,567.5");
  assert.equal(formatAmountInput("12."), "12.");
  assert.equal(formatAmountInput(".5"), "0.5");
  assert.equal(formatAmountInput("abc"), "");
});
