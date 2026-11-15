import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkRange, parseAdaUsd, parseCandles, toUsdPoints } from "../src/lib/dexhunter.ts";

test("candles: only well-formed days survive, sorted, volume defaults to 0", () => {
  const out = parseCandles({
    data: [
      { close: 0.002, timestamp: "2025-01-02T00:00:00Z", volume: 10 },
      { close: 0.001, timestamp: "2025-01-01T00:00:00Z" },
      { close: 0, timestamp: "2025-01-03T00:00:00Z", volume: 5 },
      { close: "0.5", timestamp: "2025-01-04T00:00:00Z" },
      { close: 0.3, timestamp: "garbage" },
      { close: 0.4, timestamp: "2025-01-05T00:00:00Z", volume: -1 },
      null,
    ],
  });
  assert.deepEqual(out.map((c) => c.date), ["2025-01-01", "2025-01-02", "2025-01-05"]);
  assert.equal(out[0].volume, 0);
  assert.equal(out[2].volume, 0, "a negative volume is not trusted");
  assert.deepEqual(parseCandles(null), []);
  assert.deepEqual(parseCandles({ data: "nope" }), []);
});

test("ADA/USD: the close is keyed by the UTC day of the candle", () => {
  const m = parseAdaUsd({ data: { ohlc: [{ timestamp: "1735603200", close: "0.84319" }, { timestamp: "1735689600", close: "bad" }] } });
  assert.equal(m.get("2024-12-31"), 0.84319);
  assert.equal(m.size, 1);
  assert.equal(parseAdaUsd({}).size, 0);
});

test("USD points: price and volume are scaled by that day's ADA/USD, and a day without one is dropped", () => {
  const candles = [
    { date: "2025-06-30", close: 0.00109371, volume: 1000 },
    { date: "2025-07-01", close: 0.001, volume: 50 },
  ];
  const pts = toUsdPoints(candles, new Map([["2025-06-30", 0.57255]]));
  assert.equal(pts.length, 1, "no ADA/USD for 07-01, so no price rather than a guess");
  assert.ok(Math.abs(pts[0].price - 0.00109371 * 0.57255) < 1e-12);
  assert.ok(Math.abs((pts[0].volume ?? 0) - 1000 * 0.57255) < 1e-9);
  assert.equal(pts[0].source, "DexHunter");
  assert.equal(pts[0].sparse, undefined, "DexHunter days are continuous, so they keep the strict 3-day rule");
});

test("the NMKR cross-check: DexHunter ADA price x Bitstamp ADA/USD lands within 3% of GeckoTerminal's USD price", () => {
  const cases = [
    { ada: 0.00109371, usd: 0.57255, gt: 6.215e-4 },
    { ada: 0.000601311, usd: 0.80646, gt: 4.791e-4 },
    { ada: 0.000538544, usd: 0.6668, gt: 3.519e-4 },
  ];
  for (const c of cases) {
    const [p] = toUsdPoints([{ date: "2025-01-01", close: c.ada, volume: 0 }], new Map([["2025-01-01", c.usd]]));
    assert.ok(Math.abs(p.price - c.gt) / c.gt < 0.03, `${p.price} vs ${c.gt}`);
  }
});

test("chunkRange covers the range exactly once, in windows no longer than asked", () => {
  const w = chunkRange("2025-01-01", "2025-01-10", 4);
  assert.deepEqual(w, [["2025-01-01", "2025-01-04"], ["2025-01-05", "2025-01-08"], ["2025-01-09", "2025-01-10"]]);
  assert.deepEqual(chunkRange("2025-01-01", "2025-01-01", 300), [["2025-01-01", "2025-01-01"]]);
  assert.deepEqual(chunkRange("2025-02-01", "2025-01-01"), []);
});
