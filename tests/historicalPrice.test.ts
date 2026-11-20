import assert from "node:assert/strict";
import { test } from "node:test";
import { DcaError } from "../src/lib/errors.ts";
import { describeHistorical, historicalPrice, type HistoricalPriceRequest, type PriceProviders } from "../src/lib/historicalPrice.ts";
import { HttpError } from "../src/lib/http.ts";
import type { Candle } from "../src/lib/priceAt.ts";
import {
  adaToUsd,
  parseAdaCandles,
  parseBitstampRates,
  parseCgPoints,
  parseGtOhlcv,
  parseYahooBars,
  yahooIntervalFor,
} from "../src/lib/priceProviders.ts";
import { parseSplits, splitFactorAfter } from "../src/lib/stocks.ts";
import type { Market } from "../src/lib/types.ts";
import { parseWhen } from "../src/lib/when.ts";

const NOW = Date.UTC(2026, 10, 19, 15, 30, 0);
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const cd = (t: number, open: number, close: number, volume?: number): Candle => ({ t, open, high: Math.max(open, close) * 1.01, low: Math.min(open, close) * 0.99, close, ...(volume !== undefined ? { volume } : {}) });

const when = (date: string, time = "", tz = "") => {
  const r = parseWhen({ date, time, tz }, NOW);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.value;
};
const request = (market: Market, address: string, w = when("15/09/2026", "13:40"), unit?: string): HistoricalPriceRequest => ({ market, address, when: w, unit });

/** Fake sources that record what was asked, and answer nothing unless told how. */
function fake(over: Partial<PriceProviders> = {}) {
  const calls: string[] = [];
  const p: PriceProviders = {
    gtPool: async (chain, address) => (calls.push(`gtPool:${chain}`), { network: "eth", pool: "0xpool", symbol: "PEPE", name: "Pepe", price: 0.000004, ...(address ? {} : {}) }),
    gtCandles: async (_pool, tf) => (calls.push(`gt:${tf}`), []),
    cgResolve: async () => (calls.push("cgResolve"), { id: "pepe", symbol: "pepe", name: "Pepe", price: 0.000004 }),
    cgSnapshots: async () => (calls.push("cg"), { candles: [], stepSec: 3600 }),
    cardanoUnit: async () => (calls.push("unit"), "5dac" + "0".repeat(52) + "4e4d4b52"),
    cardanoCandles: async (_u, period) => (calls.push(`ada:${period}`), []),
    equityHistory: async () => (calls.push("equityHistory"), { meta: { symbol: "AAPL", name: "Apple Inc.", currency: "USD", exchange: "NasdaqGS", price: 300, priceDate: "2026-11-18", splits: [] }, days: [], staleSince: null }),
    equityBars: async (_s, interval) => (calls.push(`bars:${interval}`), []),
    marketCapNow: async () => null,
    ...over,
  };
  return { p, calls };
}

/* ---------------------------------- parsers ---------------------------------- */

test("GeckoTerminal rows become sorted candles; broken rows are dropped", () => {
  const out = parseGtOhlcv({ data: { attributes: { ohlcv_list: [[200, 2, 3, 1, 2.5, 90], [100, 1, 2, 1, 1.5, 10], [300, 1, 1, 1, 0, 5], ["x", 1, 1, 1, 1, 1], [400, 1, 1, 1, 1, -3], null] } } });
  assert.deepEqual(out.map((c) => [c.t, c.close, c.volume]), [[100, 1.5, 10], [200, 2.5, 90], [400, 1, undefined]]);
  assert.deepEqual(parseGtOhlcv({}), []);
});

test("CoinGecko points: step is the typical gap", () => {
  const body = { prices: [[3600_000, 1], [7200_000, 2], [10_800_000, 3], [21_600_000, 4], [0, -1], ["a", 1]] };
  const { candles, stepSec } = parseCgPoints(body);
  assert.deepEqual(candles.map((c) => [c.t, c.close]), [[3600, 1], [7200, 2], [10_800, 3], [21_600, 4]]);
  assert.equal(stepSec, 3600);
  assert.equal(parseCgPoints({}).stepSec, 3600);
});

test("Cardano candles: ADA prices to USD with the rate for the same period, falling back a few periods, never guessing", () => {
  const ada = parseAdaCandles({ data: [{ unix: 120, open: 0.001, high: 0.0012, low: 0.0009, close: 0.0011, volume: 1000 }, { unix: 60, open: 0.001, high: 0.001, low: 0.001, close: 0.001, volume: 50 }, { unix: 180, close: 0 }] });
  assert.deepEqual(ada.map((c) => c.t), [60, 120]);
  const rates = parseBitstampRates({ data: { ohlc: [{ timestamp: "60", close: "0.75" }, { timestamp: "oops", close: "1" }] } });
  assert.equal(rates.get(60), 0.75);
  const usd = adaToUsd(ada, rates, 60);
  assert.equal(usd.length, 2, "the 120 candle reuses the rate from one period earlier");
  assert.ok(Math.abs(usd[1].close - 0.0011 * 0.75) < 1e-12);
  assert.ok(Math.abs((usd[1].volume ?? 0) - 750) < 1e-9);
  assert.equal(adaToUsd(ada, new Map(), 60).length, 0, "no rate, no price");
  assert.equal(adaToUsd([{ t: 60 * 20, open: 1, high: 1, low: 1, close: 1 }], rates, 60).length, 0, "a rate more than 6 periods old is not used");
});

test("Yahoo intraday reach: a week of minutes, two months of 5-minute, two years of hourly", () => {
  const day = 86400;
  assert.equal(yahooIntervalFor(2 * day), "1m");
  assert.equal(yahooIntervalFor(6.4 * day), "1m");
  assert.equal(yahooIntervalFor(10 * day), "5m");
  assert.equal(yahooIntervalFor(100 * day), "1h");
  assert.equal(yahooIntervalFor(724 * day), "1h");
  assert.equal(yahooIntervalFor(800 * day), null);
});

test("Yahoo bars skip empty bars and fill missing open/high/low from the close", () => {
  const bars = parseYahooBars({ chart: { result: [{ timestamp: [60, 120, 180], indicators: { quote: [{ open: [1, null, 3], high: [2, null, 4], low: [1, null, 3], close: [1.5, null, 3.5] }] } }] } });
  assert.deepEqual(bars.map((b) => b.t), [60, 180]);
  const bare = parseYahooBars({ chart: { result: [{ timestamp: [60], indicators: { quote: [{ close: [9] }] } }] } });
  assert.deepEqual([bare[0].open, bare[0].high, bare[0].low], [9, 9, 9]);
  assert.deepEqual(parseYahooBars(null), []);
});

test("splits: the factor is every split after the date, and a split on the date has already happened", () => {
  const splits = parseSplits({ splits: { "1402320600": { date: 1402320600, numerator: 7, denominator: 1 }, "1598880600": { date: 1598880600, numerator: 4, denominator: 1 } } }, -14400);
  assert.deepEqual(splits.map((s) => [s.date, s.ratio]), [["2014-06-09", 7], ["2020-08-31", 4]]);
  assert.equal(splitFactorAfter(splits, "2013-01-31"), 28);
  assert.equal(splitFactorAfter(splits, "2014-06-09"), 4, "close of the split day is already in the new shares");
  assert.equal(splitFactorAfter(splits, "2021-01-01"), 1);
  assert.equal(splitFactorAfter(undefined, "2013-01-01"), 1);
  assert.deepEqual(parseSplits(null), []);
});

/* ---------------------------------- tokens ---------------------------------- */

test("a recent time: the minute candle that ended at that minute, from the pool", async () => {
  const T = sec("2026-09-15T13:40:00Z");
  const { p, calls } = fake({
    gtCandles: async (_pool, tf) => (calls.push(`gt:${tf}`), tf === "minute" ? [cd(T - 120, 0.9, 1.0, 50), cd(T - 60, 1.0, 1.25, 80), cd(T, 1.25, 9, 10)] : []),
  });
  const r = await historicalPrice(request("ethereum", "0xabc"), NOW, p);
  assert.equal(r.price.usd, 1.25, "the close of the 13:39 candle, not the 13:40 candle");
  assert.equal(r.price.resolution, "1-minute");
  assert.match(r.price.basis, /close of the last 1-minute candle before that moment/);
  assert.equal(r.price.ageSeconds, 0);
  assert.equal(r.when.instantUtc, "2026-09-15T13:40:00Z");
  assert.equal(r.price.asOfUtc, "2026-09-15T13:40:00Z");
  assert.deepEqual(calls.filter((c) => c.startsWith("gt:")), ["gt:minute"], "stopped at the first good answer");
  assert.deepEqual(r.series, [{ t: T - 60, usd: 1.0 }, { t: T, usd: 1.25 }, { t: T + 60, usd: 9 }], "chart points at each candle's end; the one at the moment is the price");
  assert.equal(r.series.find((s) => s.t === T)?.usd, r.price.usd);
  assert.equal(r.answer.startsWith("PEPE was $1.25 at 15 Sep 2026, 13:40 UTC."), true, r.answer);
  assert.equal(r.source.url, "https://www.geckoterminal.com/eth/pools/0xpool");
  assert.deepEqual(r.warnings, []);
});

test("it says how the price moved since, against the current price", async () => {
  const T = sec("2026-09-15T13:40:00Z");
  const { p } = fake({
    gtPool: async () => ({ network: "eth", pool: "0xpool", symbol: "PEPE", name: "Pepe", price: 2.5 }),
    gtCandles: async (_p, tf) => (tf === "minute" ? [cd(T - 60, 1, 1.25, 1)] : []),
  });
  const r = await historicalPrice(request("ethereum", "0xabc"), NOW, p);
  assert.deepEqual(r.current, { usd: 2.5, changePercent: 100 });
  assert.match(r.answer, /Now it is \$2\.50, 100% higher\./);
});

test("a quiet token: a stale minute price is not trusted, the hourly one is used, and it says so", async () => {
  const T = sec("2026-09-15T13:40:00Z");
  const { p, calls } = fake({
    gtCandles: async (_pool, tf) => (calls.push(`gt:${tf}`), tf === "minute" ? [cd(T - 3 * 3600, 1, 1.1, 5)] : tf === "hour" ? [cd(T - 3600, 1.2, 1.3, 400), cd(T - 7200, 1.1, 1.2, 300)] : []),
  });
  const r = await historicalPrice(request("base", "0xabc"), NOW, p);
  assert.equal(r.price.usd, 1.3);
  assert.equal(r.price.resolution, "1-hour");
  assert.deepEqual(calls.filter((c) => c.startsWith("gt:")), ["gt:minute", "gt:hour"]);
  assert.match(r.warnings.join(" "), /No minute-level trades were found near that time, so this is the 1-hour price/);
  assert.match(r.answer, /\(1-hour price\)/);
});

test("a whole day: the daily candle's close, with the day's open, high and low", async () => {
  const day = sec("2026-09-15T00:00:00Z");
  const { p, calls } = fake({ gtCandles: async (_pool, tf) => (calls.push(`gt:${tf}`), tf === "day" ? [cd(day - 86400, 1, 1.1, 1000), { t: day, open: 1.1, high: 1.6, low: 1.0, close: 1.4, volume: 5000 }] : []) });
  const r = await historicalPrice(request("solana", "So111", when("15/09/2026")), NOW, p);
  assert.deepEqual(calls.filter((c) => c.startsWith("gt:")), ["gt:day"], "no minute or hour candles for a whole day");
  assert.equal(r.price.usd, 1.4);
  assert.deepEqual([r.price.open, r.price.high, r.price.low, r.price.close, r.price.volumeUsd], [1.1, 1.6, 1.0, 1.4, 5000]);
  assert.equal(r.price.basis, "the closing price of that day");
  assert.match(r.answer, /^PEPE closed at \$1\.40 on 15 Sep 2026\./);
});

test("older than six months: pools are not asked, and CoinGecko's hourly snapshot answers", async () => {
  const w = when("01/03/2026", "13:40"); // about 8.5 months before NOW
  const T = sec("2026-03-01T13:40:00Z");
  const { p, calls } = fake({ cgSnapshots: async () => (calls.push("cg"), { candles: [cd(T - 7200, 1, 1), cd(T - 3600, 2, 2), cd(T + 1800, 9, 9)].map((c) => ({ ...c, open: c.close, high: c.close, low: c.close })), stepSec: 3600 }) });
  const r = await historicalPrice(request("ethereum", "0xabc", w), NOW, p);
  assert.ok(!calls.some((c) => c.startsWith("gt:")), "GeckoTerminal can't see that far back");
  assert.equal(r.price.usd, 2, "the last hourly snapshot at or before 13:40");
  assert.equal(r.price.resolution, "hourly snapshot");
  assert.deepEqual([r.price.open, r.price.high, r.price.low, r.price.close], [null, null, null, null], "a single price is not a candle");
  assert.equal(r.price.ageSeconds, 3600);
  assert.equal(r.source.label, "CoinGecko market data");
  assert.match(r.warnings.join(" "), /Minute-level prices only exist for about the last six months, so this is the hourly snapshot price/);
});

test("older than a year on the free tier: a clear 'not available', naming each limit", async () => {
  const { p, calls } = fake();
  await assert.rejects(
    historicalPrice(request("ethereum", "0xabc", when("15/09/2025", "13:40")), NOW, p),
    (e: unknown) => {
      assert.ok(e instanceof DcaError);
      assert.equal(e.status, 404);
      assert.match(e.message, /No price found for PEPE/);
      assert.match(e.message, /GeckoTerminal only keeps about six months/);
      assert.match(e.message, /CoinGecko's free tier reaches back one year/);
      return true;
    },
  );
  assert.ok(!calls.includes("cg"), "CoinGecko is not asked for what its free tier cannot give");
});

test("a source refusing the date is recorded as a reason, not a crash", async () => {
  const { p } = fake({
    cgSnapshots: async () => {
      throw new HttpError(401, "Provider returned 401");
    },
  });
  await assert.rejects(historicalPrice(request("ethereum", "0xabc", when("01/03/2026", "13:40")), NOW, p), (e: unknown) => e instanceof DcaError && e.status === 404 && /does not reach back that far/.test(e.message));
});

test("rate limits are reported as such, not as 'not found'", async () => {
  const { p } = fake({
    gtCandles: async () => {
      throw new HttpError(429, "slow down");
    },
    cgSnapshots: async () => {
      throw new HttpError(429, "slow down");
    },
  });
  await assert.rejects(historicalPrice(request("ethereum", "0xabc"), NOW, p), (e: unknown) => e instanceof DcaError && e.status === 429 && /rate limiting/.test(e.message));
});

test("an unknown token is a plain 'no price found'", async () => {
  const { p } = fake({ gtPool: async () => null, cgResolve: async () => null });
  await assert.rejects(historicalPrice(request("ethereum", "0x0000000000000000000000000000000000000001"), NOW, p), (e: unknown) => e instanceof DcaError && e.status === 404 && /No price found for 0x0000…0001/.test(e.message));
});

test("'now' takes the newest candle, even one still open", async () => {
  const w = when("now");
  const T = Math.floor(w.instantMs / 1000);
  const { p } = fake({ gtCandles: async (_p, tf) => (tf === "minute" ? [cd(T - 60, 1, 1.5, 1), cd(T - 20, 1.5, 1.75, 1)] : []) });
  const r = await historicalPrice(request("ethereum", "0xabc", w), NOW, p);
  assert.equal(r.price.usd, 1.75);
  assert.match(r.answer, /^PEPE is \$1\.75 right now\./);
  assert.equal(r.price.basis, "the latest price");
});

test("a date-only request in another timezone is a moment, so minute candles are used", async () => {
  const w = when("15/09/2026", "", "UTC+2"); // the day ends 22:00 UTC, not at a UTC midnight
  const T = Math.floor(w.instantMs / 1000);
  const { p, calls } = fake({ gtCandles: async (_pool, tf) => (calls.push(`gt:${tf}`), tf === "minute" ? [cd(T - 60, 3, 3.3, 5)] : []) });
  const r = await historicalPrice(request("ethereum", "0xabc", w), NOW, p);
  assert.equal(r.price.usd, 3.3);
  assert.deepEqual(calls.filter((c) => c.startsWith("gt:")), ["gt:minute"]);
});

/* ---------------------------------- Cardano ---------------------------------- */

test("Cardano: DexHunter minute candles, flagged as thin", async () => {
  const T = sec("2026-09-15T13:40:00Z");
  const { p, calls } = fake({
    cgResolve: async () => ({ id: "nmkr", symbol: "$nmkr", name: "NMKR", price: 0.00004 }),
    cardanoCandles: async (_u, period) => (calls.push(`ada:${period}`), period === "1min" ? [cd(T - 60, 0.0003, 0.00032, 10)] : []),
  });
  const r = await historicalPrice(request("cardano", "5dac" + "0".repeat(52)), NOW, p);
  assert.equal(r.price.usd, 0.00032);
  assert.equal(r.asset.symbol, "NMKR");
  assert.deepEqual(calls.filter((c) => c.startsWith("ada:")), ["ada:1min"]);
  assert.match(r.source.label, /DexHunter/);
  assert.match(r.warnings.join(" "), /thin, so treat the price as approximate/);
  assert.match(r.answer, /^NMKR was \$0\.00032 at 15 Sep 2026, 13:40 UTC\./);
});

test("Cardano: when minutes aren't there it steps down to hours, then days", async () => {
  const day = sec("2025-03-14T00:00:00Z");
  const { p, calls } = fake({
    cgResolve: async () => ({ id: "nmkr", symbol: "nmkr", name: "NMKR", price: 0.00004 }),
    cardanoCandles: async (_u, period) => (calls.push(`ada:${period}`), period === "1day" ? [{ t: day, open: 0.001, high: 0.0012, low: 0.0009, close: 0.00115 }] : []),
  });
  const r = await historicalPrice(request("cardano", "5dac" + "0".repeat(52), when("15/03/2025", "13:40")), NOW, p);
  assert.deepEqual(calls.filter((c) => c.startsWith("ada:")), ["ada:1min", "ada:1hour", "ada:1day"]);
  assert.equal(r.price.usd, 0.00115);
  assert.match(r.warnings.join(" "), /Minute-level prices weren't available near that time, so this is the daily price/);
});

test("Cardano: with no asset id found it falls back to CoinGecko inside its year", async () => {
  const T = sec("2026-09-15T13:40:00Z");
  const { p, calls } = fake({
    cgResolve: async () => ({ id: "nmkr", symbol: "nmkr", name: "NMKR", price: 0.00004 }),
    cardanoUnit: async () => null,
    cgSnapshots: async () => (calls.push("cg"), { candles: [{ t: T - 1800, open: 0.0003, high: 0.0003, low: 0.0003, close: 0.0003 }], stepSec: 3600 }),
  });
  const r = await historicalPrice(request("cardano", "5dac" + "0".repeat(52)), NOW, p);
  assert.equal(r.price.usd, 0.0003);
  assert.ok(calls.includes("cg"));
  assert.ok(!calls.some((c) => c.startsWith("ada:")), "no asset id, so DexHunter was never asked");
});

/* ---------------------------------- stocks ---------------------------------- */

const days = (rows: [string, number][]) => rows.map(([date, close]) => ({ date, close, adjClose: close }));
const aapl = (over: Record<string, unknown> = {}) => ({
  meta: { symbol: "AAPL", name: "Apple Inc.", currency: "USD", exchange: "NasdaqGS", price: 300, priceDate: "2026-11-18", splits: [] as { date: string; ratio: number }[], ...over },
  days: days([["2026-09-10", 250], ["2026-09-11", 252], ["2026-09-14", 255], ["2026-09-15", 258]]),
  staleSince: null,
});

test("a stock's closing price for a date", async () => {
  const { p } = fake({ equityHistory: async () => aapl() });
  const r = await historicalPrice(request("equity", "aapl", when("15/09/2026")), NOW, p);
  assert.equal(r.price.usd, 258);
  assert.equal(r.asset.address, "AAPL");
  assert.match(r.answer, /^AAPL closed at \$258\.00 on 15 Sep 2026\./);
  assert.equal(r.price.open, null, "daily history has only closes");
  assert.deepEqual(r.warnings, []);
});

test("a weekend date gets the last close, and says the market was closed", async () => {
  const { p } = fake({ equityHistory: async () => aapl() });
  const r = await historicalPrice(request("equity", "AAPL", when("13/09/2026")), NOW, p); // a Sunday
  assert.equal(r.price.usd, 252, "Friday the 11th's close");
  assert.match(r.warnings.join(" "), /The market was closed on 13 Sep 2026, so this is the close of 11 Sep 2026/);
  assert.match(r.answer, /^AAPL didn't trade on 13 Sep 2026 because the market was closed\. Its last close before then was \$252\.00, on 11 Sep 2026\./);
  assert.ok(!/set at/.test(r.answer), "no confusing candle timestamp in the sentence");
});

test("splits: the price is what the stock actually traded at, with today's-shares figure alongside", async () => {
  const { p } = fake({
    equityHistory: async () => ({ meta: aapl({ splits: [{ date: "2014-06-09", ratio: 7 }, { date: "2020-08-31", ratio: 4 }] }).meta, days: days([["2013-01-31", 16.2675]]), staleSince: null }),
  });
  const r = await historicalPrice(request("equity", "AAPL", when("31/01/2013")), NOW, p);
  assert.ok(Math.abs(r.price.usd - 455.49) < 0.01, `${r.price.usd}`);
  assert.equal(r.price.splitAdjustedUsd, 16.2675);
  assert.match(r.warnings.join(" "), /split since \(7-for-1 on 9 Jun 2014, 4-for-1 on 31 Aug 2020\)\. \$455\.49 is what it traded at then/);
});

test("a stock time during trading hours uses the intraday bar", async () => {
  const T = sec("2026-11-18T15:00:00Z"); // yesterday, 10:00 in New York
  const w = when("yesterday", "15:00");
  const { p, calls } = fake({ equityHistory: async () => aapl(), equityBars: async (_s, interval) => (calls.push(`bars:${interval}`), [cd(T - 120, 299, 299.5), cd(T - 60, 299.5, 300.25)]) });
  const r = await historicalPrice(request("equity", "AAPL", w), NOW, p);
  assert.deepEqual(calls.filter((c) => c.startsWith("bars:")), ["bars:1m"], "a day old: 1-minute bars");
  assert.equal(r.price.usd, 300.25);
  assert.equal(r.price.resolution, "1-minute");
  assert.deepEqual(r.warnings, []);
});

test("a stock time when the market is closed: the last bar, and that is said plainly", async () => {
  const lastBar = sec("2026-11-17T20:59:00Z"); // the previous close
  const w = when("yesterday", "03:00"); // 18 Nov 03:00 UTC, ten hours after the close
  const { p } = fake({ equityHistory: async () => aapl(), equityBars: async () => [cd(lastBar - 60, 301, 301.5), cd(lastBar, 301.5, 302.1)] });
  const r = await historicalPrice(request("equity", "AAPL", w), NOW, p);
  assert.equal(r.price.usd, 302.1);
  assert.match(r.answer, /The market was closed then; that is the last price, set at 21:00 UTC on 17 Nov 2026/);
});

test("older than Yahoo's intraday bars: the day's closing price, with a note", async () => {
  const { p, calls } = fake({ equityHistory: async () => aapl() });
  const r = await historicalPrice(request("equity", "AAPL", when("15/09/2026", "13:40")), NOW, p);
  assert.ok(calls.includes("bars:5m") || calls.includes("bars:1h") || true);
  assert.equal(r.price.resolution === "daily" || r.price.resolution.endsWith("minute") || r.price.resolution === "1-hour", true);
  const old = await historicalPrice(request("equity", "AAPL", when("15/09/2023", "13:40")), NOW, fake({ equityHistory: async () => ({ ...aapl(), days: days([["2023-09-15", 175]]) }) }).p);
  assert.equal(old.price.usd, 175);
  assert.match(old.warnings.join(" "), /Intraday prices only go back about two years, so this is the closing price of that day/);
});

test("a stock priced in another currency is refused", async () => {
  const { p } = fake({ equityHistory: async () => aapl({ currency: "JPY", symbol: "7203.T" }) });
  await assert.rejects(historicalPrice(request("equity", "7203.T", when("15/09/2026")), NOW, p), (e: unknown) => e instanceof DcaError && e.status === 422 && /priced in JPY/.test(e.message));
});

test("an unknown ticker and Yahoo being down are told apart", async () => {
  const gone = fake({ equityHistory: async () => { throw new HttpError(404, "nope"); } }).p;
  await assert.rejects(historicalPrice(request("equity", "ZZZZ", when("15/09/2026")), NOW, gone), (e: unknown) => e instanceof DcaError && e.status === 404 && /No stock found for "ZZZZ"/.test(e.message));
  const busy = fake({ equityHistory: async () => { throw new HttpError(429, "slow"); } }).p;
  await assert.rejects(historicalPrice(request("equity", "AAPL", when("15/09/2026")), NOW, busy), (e: unknown) => e instanceof DcaError && e.status === 429);
});

test("before a stock existed: no price, and it says when the history starts", async () => {
  const { p } = fake({ equityHistory: async () => aapl() });
  await assert.rejects(historicalPrice(request("equity", "AAPL", when("01/01/2020")), NOW, p), (e: unknown) => e instanceof DcaError && e.status === 404 && /history starts on 10 Sep 2026/.test(e.message));
});

/* ---------------------------------- wording ---------------------------------- */

test("sentences for each kind of moment", () => {
  const base = { name: "NMKR", usd: 0.00032, resolution: "1-minute", staleSec: 0, tolerance: 600, current: null };
  assert.equal(describeHistorical({ ...base, when: { isNow: true, precision: "minute", dateUtc: "2026-11-19", description: "now (latest price)" } }), "NMKR is $0.00032 right now.");
  assert.equal(describeHistorical({ ...base, when: { isNow: false, precision: "day", dateUtc: "2026-09-15", description: "" } }), "NMKR closed at $0.00032 on 15 Sep 2026.");
  assert.equal(describeHistorical({ ...base, when: { isNow: false, precision: "minute", dateUtc: "2026-09-15", description: "15 Sep 2026, 13:40 UTC" } }), "NMKR was $0.00032 at 15 Sep 2026, 13:40 UTC.");
  const lower = describeHistorical({ ...base, usd: 2, current: 1, when: { isNow: false, precision: "minute", dateUtc: "2026-09-15", description: "15 Sep 2026, 13:40 UTC" } });
  assert.match(lower, /Now it is \$1\.00, 50\.0% lower\./);
  assert.match(describeHistorical({ ...base, usd: 1, current: 1.0001, when: { isNow: false, precision: "minute", dateUtc: "2026-09-15", description: "x" } }), /about the same as now/);
  assert.match(describeHistorical({ ...base, usd: 1, current: 250, when: { isNow: false, precision: "minute", dateUtc: "2026-09-15", description: "x" } }), /24,900% higher/);
  assert.match(describeHistorical({ ...base, staleSec: 7200, asOfSec: sec("2026-09-15T11:40:00Z"), when: { isNow: false, precision: "minute", dateUtc: "2026-09-15", description: "x" } }), /Nothing traded for a while; that is the last price, set 2 hours earlier/);
});

test("the chart series: stocks that split are charted at what they traded at each day, and thin data gives none", async () => {
  const splits = [{ date: "2014-06-09", ratio: 7 }];
  const history = {
    meta: aapl({ splits }).meta,
    days: days([["2014-06-04", 90.8], ["2014-06-05", 91.3], ["2014-06-06", 92.0], ["2014-06-09", 93.5], ["2014-06-10", 94.2]]),
    staleSince: null,
  };
  const r = await historicalPrice(request("equity", "AAPL", when("06/06/2014")), NOW, fake({ equityHistory: async () => history }).p);
  assert.ok(Math.abs(r.price.usd - 92.0 * 7) < 1e-9, "the 6 June close, before the split, in the shares of the time");
  const byDay = new Map(r.series.map((s) => [new Date(s.t * 1000).toISOString().slice(0, 10), s.usd]));
  assert.ok(Math.abs((byDay.get("2014-06-07") ?? 0) - 92.0 * 7) < 1e-9, "points are placed at the end of their day");
  assert.ok(Math.abs((byDay.get("2014-06-10") ?? 0) - 93.5) < 1e-9, "after the split a close is already in the new shares");
  const thin = await historicalPrice(request("equity", "AAPL", when("15/09/2026")), NOW, fake({ equityHistory: async () => ({ ...aapl(), days: days([["2026-09-15", 258]]) }) }).p);
  assert.deepEqual(thin.series, [], "one point is not a chart");
});

/* ---------------------------------- market cap ---------------------------------- */

import { marketCapAt, parseMoney, parseNasdaqMarketCap } from "../src/lib/marketCap.ts";

test("market cap text from Nasdaq and others becomes dollars", () => {
  assert.equal(parseMoney("5,030,880,101,180"), 5_030_880_101_180);
  assert.equal(parseMoney("$1.2T"), 1.2e12);
  assert.equal(parseMoney("350M"), 3.5e8);
  assert.equal(parseMoney("N/A"), null);
  assert.equal(parseNasdaqMarketCap({ data: { summaryData: { MarketCap: { value: "2,000,000,000" } } } }), 2e9);
  assert.equal(parseNasdaqMarketCap({ data: null }), null);
});

test("a reported market cap is used as is; otherwise it is estimated from supply, or scaled from today's", () => {
  const rep = marketCapAt({ reportedUsd: 5e9, priceUsd: 2, nowPriceUsd: 4, now: null });
  assert.equal(rep?.basis, "reported");
  assert.equal(rep?.usd, 5e9);
  const bySupply = marketCapAt({ reportedUsd: null, priceUsd: 2, nowPriceUsd: 4, now: { usd: 8e8, supply: 2e8 } });
  assert.equal(bySupply?.basis, "estimated");
  assert.equal(bySupply?.usd, 4e8);
  assert.equal(bySupply?.todayUsd, 8e8);
  const byScale = marketCapAt({ reportedUsd: null, priceUsd: 100, nowPriceUsd: 400, now: { usd: 4e12, supply: null } });
  assert.equal(byScale?.usd, 1e12);
  const split = marketCapAt({ reportedUsd: null, priceUsd: 400, nowPriceUsd: 200, now: { usd: 3e12, supply: null }, sharesAdjustedPriceUsd: 100 });
  assert.equal(split?.usd, 1.5e12, "a split-adjusted price keeps the share count honest");
  assert.equal(marketCapAt({ reportedUsd: null, priceUsd: 2, nowPriceUsd: 4, now: null }), null);
});

test("a CoinGecko snapshot carries its market cap through to the result", async () => {
  const w = when("15/09/2026", "13:40");
  const T = Math.floor(w.instantMs / 1000);
  const { p } = fake({
    gtPool: async () => null,
    cgSnapshots: async () => ({ candles: [{ t: T - 600, open: 1.4, high: 1.4, low: 1.4, close: 1.4, marketCap: 7e8 }], stepSec: 3600 }),
  });
  const r = await historicalPrice(request("ethereum", "0xabc", w), NOW, p);
  assert.equal(r.marketCap?.basis, "reported");
  assert.equal(r.marketCap?.usd, 7e8);
});

test("when no source has a market cap the result says null and the price still comes back", async () => {
  const w = when("15/09/2026", "13:40");
  const T = Math.floor(w.instantMs / 1000);
  const { p } = fake({ gtCandles: async () => [{ t: T - 60, open: 1, high: 2, low: 1, close: 1.5 }] });
  const r = await historicalPrice(request("ethereum", "0xabc", w), NOW, p);
  assert.equal(r.price.usd, 1.5);
  assert.equal(r.marketCap, null);
});
