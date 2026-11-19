import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAge, formatUsdPrice, pickCandle, toleranceSec, type Candle } from "../src/lib/priceAt.ts";

const c = (t: number, open: number, close: number, extra: Partial<Candle> = {}): Candle => ({ t, open, high: Math.max(open, close), low: Math.min(open, close), close, ...extra });
const MIN = 60;

test("the price at 13:40:00 is the close of the 13:39 candle", () => {
  const T = 13 * 3600 + 40 * 60;
  const candles = [c(T - 2 * MIN, 1.0, 1.1), c(T - MIN, 1.1, 1.2), c(T, 1.2, 1.5)];
  const p = pickCandle(candles, T, MIN);
  assert.ok(p);
  assert.equal(p.priceUsd, 1.2, "13:39's close, not the 13:40 candle's");
  assert.equal(p.candle.t, T - MIN);
  assert.equal(p.basis, "close-before");
  assert.equal(p.staleSec, 0);
});

test("a moment inside a candle uses that candle's open when nothing finished right before it", () => {
  const T = 1000 * MIN + 30; // 30 seconds into the candle that starts at 1000*MIN
  const p = pickCandle([c(990 * MIN, 5, 6), c(1000 * MIN, 7, 9)], T, MIN);
  assert.ok(p);
  assert.equal(p.priceUsd, 7);
  assert.equal(p.basis, "open-of-candle");
  assert.equal(p.staleSec, 0);
});

test("a moment inside a candle that follows another uses the earlier close, which is the same price", () => {
  const T = 1000 * MIN + 30;
  const p = pickCandle([c(999 * MIN, 5, 6), c(1000 * MIN, 6, 9)], T, MIN);
  assert.ok(p);
  assert.equal(p.priceUsd, 6);
  assert.equal(p.basis, "close-before");
});

test("quiet markets: the last price still stands, and its age is reported", () => {
  const T = 10_000 * MIN;
  const last = c(T - 190 * MIN, 2, 3);
  const p = pickCandle([c(T - 400 * MIN, 1, 1.5), last], T, MIN);
  assert.ok(p);
  assert.equal(p.priceUsd, 3);
  assert.equal(p.basis, "carried-forward");
  assert.equal(p.staleSec, 189 * MIN, "190 minutes back, minus the candle's own minute");
  assert.ok(p.staleSec > toleranceSec(MIN), "which is beyond what a minute candle should be trusted for");
});

test("candles after the moment are ignored, and nothing before it means no price", () => {
  const T = 5000;
  assert.equal(pickCandle([c(T + 1, 9, 9)], T, MIN), null);
  assert.equal(pickCandle([], T, MIN), null);
  const p = pickCandle([c(T - 4000, 1, 2), c(T + 600, 8, 8)], T, MIN);
  assert.equal(p?.priceUsd, 2);
});

test("daily candles: a day's close is the price at the moment the day ends", () => {
  const DAY = 86400;
  const day = 20_000 * DAY;
  const candles = [c(day - DAY, 10, 11), c(day, 11, 12), c(day + DAY, 12, 14)];
  const p = pickCandle(candles, day + DAY, DAY);
  assert.ok(p);
  assert.equal(p.priceUsd, 12, "the close of the day that ended at that moment");
  assert.equal(p.candle.t, day);
  assert.equal(p.staleSec, 0);
});

test("hourly snapshots (length 0) give the latest one at or before the moment", () => {
  const T = 1_000_000;
  const p = pickCandle([c(T - 7200, 3, 3), c(T - 3000, 4, 4), c(T + 600, 9, 9)], T, 0);
  assert.equal(p?.priceUsd, 4);
  assert.equal(p?.staleSec, 3000);
  assert.equal(p?.basis, "carried-forward");
});

test("right now: the newest candle's close, even though it is still open", () => {
  const T = 1000 * MIN + 20;
  const p = pickCandle([c(999 * MIN, 5, 6), c(1000 * MIN, 6, 8)], T, MIN, true);
  assert.equal(p?.priceUsd, 8);
  assert.equal(p?.basis, "latest");
});

test("unsorted input, junk values and non-positive prices are tolerated", () => {
  const T = 9000;
  const p = pickCandle([c(8000, 3, 3), { t: Number.NaN, open: 1, high: 1, low: 1, close: 1 }, c(7000, 2, 0), c(8500, 4, 4)], T, 60);
  assert.equal(p?.priceUsd, 4);
});

test("tolerance grows with the resolution", () => {
  assert.equal(toleranceSec(60), 600);
  assert.equal(toleranceSec(3600), 10800);
  assert.equal(toleranceSec(86400), 259200);
  assert.equal(toleranceSec(0), 600);
});

test("ages read like a person would say them", () => {
  assert.equal(formatAge(45), "45 seconds");
  assert.equal(formatAge(1), "1 second");
  assert.equal(formatAge(12 * 60), "12 minutes");
  assert.equal(formatAge(3 * 3600 + 10 * 60), "3 hours 10 minutes");
  assert.equal(formatAge(2 * 3600), "2 hours");
  assert.equal(formatAge(3 * 86400), "3 days");
  assert.equal(formatAge(86400), "24 hours");
});

test("prices keep their meaningful digits", () => {
  assert.equal(formatUsdPrice(0.00003219), "$0.00003219");
  assert.equal(formatUsdPrice(0.0003219), "$0.0003219");
  assert.equal(formatUsdPrice(0.5), "$0.5000");
  assert.equal(formatUsdPrice(2.5), "$2.50");
  assert.equal(formatUsdPrice(352.4512), "$352.4512");
  assert.equal(formatUsdPrice(64_123.456), "$64,123.46");
  assert.equal(formatUsdPrice(Number.NaN), "n/a");
  assert.equal(formatUsdPrice(0.00032), "$0.00032", "no meaningless trailing zeros on tiny prices");
  assert.equal(formatUsdPrice(0.00004), "$0.00004");
});

test("a moment exactly where the next candle begins: the last finished candle stands, even across a gap", () => {
  // A stock on a Sunday night: Friday's close, not Monday's candle that starts at the very moment asked about.
  const DAY = 86400;
  const monday = 20_000 * DAY;
  const friday = monday - 3 * DAY;
  const nan = Number.NaN;
  const p = pickCandle([{ t: friday, open: nan, high: nan, low: nan, close: 252 }, { t: monday, open: nan, high: nan, low: nan, close: 255 }], monday, DAY);
  assert.ok(p);
  assert.equal(p.priceUsd, 252);
  assert.equal(p.candle.t, friday);
  assert.equal(p.basis, "carried-forward");
  assert.equal(p.staleSec, 2 * DAY);
});

test("a candle with no known open is never read as if it had one", () => {
  const DAY = 86400;
  const t = 20_000 * DAY;
  const nan = Number.NaN;
  assert.equal(pickCandle([{ t, open: nan, high: nan, low: nan, close: 9 }], t, DAY), null, "at its very start and nothing before: no price");
  assert.equal(pickCandle([{ t, open: nan, high: nan, low: nan, close: 9 }], t + 100, DAY)?.priceUsd, 9, "partway through, the close is the only price there is");
});

test("a moment partway into a candle, with an earlier gap, still uses the open when it is known", () => {
  const t = 1000 * 60;
  const p = pickCandle([c(990 * 60, 5, 6), c(t, 7, 9)], t + 30, 60);
  assert.equal(p?.priceUsd, 7);
  assert.equal(p?.basis, "open-of-candle");
});
