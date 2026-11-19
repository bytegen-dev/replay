import assert from "node:assert/strict";
import { test } from "node:test";
import { findTradingDay, selectAllMonths, selectMonthPrice } from "../src/lib/select.ts";
import { localDay, parseStockSearch, parseYahooChart, stockPoints } from "../src/lib/stocks.ts";
import type { DailyPoint } from "../src/lib/types.ts";
import { maxMonthsFor, normalizeAddress, validateAddress, validateRequest } from "../src/lib/validate.ts";

const day = (date: string, price = 1): DailyPoint => ({ date, price, source: "Yahoo" });
const map = (pts: DailyPoint[]) => new Map(pts.map((p) => [p.date, p]));

// 2013-03-31 is a Sunday: the last trading day of March 2013 was Thursday the 28th (Good Friday the 29th was closed).
const MARCH_2013 = map([day("2013-03-27", 10), day("2013-03-28", 11), day("2013-04-01", 12), day("2013-04-02", 13)]);

test("month-end means the last trading day on or before the target, never the next month", () => {
  assert.equal(findTradingDay(MARCH_2013, "2013-03-31", "month-end")?.date, "2013-03-28");
  assert.equal(findTradingDay(MARCH_2013, "2013-03-28", "month-end")?.date, "2013-03-28");
});

test("first-of-month and day-of-month mean the first trading day on or after the target", () => {
  const byDate = map([day("2013-06-28", 5), day("2013-07-01", 6)]);
  assert.equal(findTradingDay(byDate, "2013-06-29", "first-of-month")?.date, "2013-07-01");
  assert.equal(findTradingDay(byDate, "2013-07-01", "first-of-month")?.date, "2013-07-01");
  assert.equal(findTradingDay(byDate, "2013-06-29", "day-of-month")?.date, "2013-07-01");
});

test("nothing within the window is no price, not a far-away guess", () => {
  assert.equal(findTradingDay(map([day("2013-03-20")]), "2013-03-31", "month-end"), null);
  assert.equal(findTradingDay(map([day("2013-04-09")]), "2013-04-01", "first-of-month"), null);
});

test("a closed-market month says so plainly and is not flagged as a warning code", () => {
  const row = selectMonthPrice("2013-03", MARCH_2013, { basis: "month-end", source: "Yahoo", today: "2026-11-19", earliestAllowed: null, tradingDays: true });
  assert.equal(row.price, 11);
  assert.equal(row.priceDate, "2013-03-28");
  assert.equal(row.source, "Yahoo");
  const note = row.notes.find((n) => n.code === "market-closed");
  assert.ok(note);
  assert.equal(note.text, "Market closed on 2013-03-31; used 2013-03-28");
  assert.ok(!row.notes.some((n) => n.code === "nearest-day"));
});

test("a month whose month-end is a trading day has no note", () => {
  // 2013-05-31 was a Friday.
  const row = selectMonthPrice("2013-05", map([day("2013-05-31", 11)]), { basis: "month-end", source: "Yahoo", today: "2026-11-19", earliestAllowed: null, tradingDays: true });
  assert.equal(row.priceDate, "2013-05-31");
  assert.deepEqual(row.notes, []);
});

test("months before the stock existed are n/a and the rest still price", () => {
  const rows = selectAllMonths("2012-01", "2012-03", [day("2012-02-29", 4), day("2012-03-30", 5)], { basis: "month-end", source: "Yahoo", today: "2026-11-19", earliestAllowed: null, tradingDays: true });
  assert.deepEqual(rows.map((r) => r.price), [null, 4, 5]);
  assert.equal(rows[0].notes[0].code, "no-data");
});

test("future months are never priced", () => {
  const [r] = selectAllMonths("2026-12", "2026-12", [day("2026-11-18", 9)], { basis: "month-end", source: "Yahoo", today: "2026-11-19", earliestAllowed: null, tradingDays: true });
  assert.equal(r.price, null);
  assert.equal(r.notes[0].code, "future");
});

const chart = (over: Record<string, unknown> = {}) => ({
  chart: {
    result: [
      {
        meta: { symbol: "AAPL", longName: "Apple Inc.", currency: "USD", fullExchangeName: "NasdaqGS", gmtoffset: -18000, regularMarketPrice: 352.45, regularMarketTime: 1795035601, ...over },
        timestamp: [1357137000, 1359640200, 1359726600, 1359900000],
        indicators: { quote: [{ close: [19.6, null, 16.3, 0] }], adjclose: [{ adjclose: [16.5, 14, null, 5] }] },
      },
    ],
  },
});

test("chart parsing: exchange-local dates, bad closes dropped, adjusted close falls back to close", () => {
  const p = parseYahooChart(chart());
  assert.ok(p);
  assert.equal(p.meta.symbol, "AAPL");
  assert.equal(p.meta.name, "Apple Inc.");
  assert.equal(p.meta.currency, "USD");
  assert.equal(p.meta.price, 352.45);
  assert.deepEqual(p.days.map((d) => d.date), ["2013-01-02", "2013-02-01"], "null and zero closes are skipped");
  assert.equal(p.days[0].adjClose, 16.5);
  assert.equal(p.days[1].adjClose, 16.3, "a missing adjusted close uses the plain close");
});

test("the exchange offset decides the calendar day", () => {
  // 2013-01-02 02:00 UTC is still the evening of Jan 1 in New York, but already Jan 2 in Tokyo.
  const ts = Date.UTC(2013, 0, 2, 2, 0, 0) / 1000;
  assert.equal(localDay(ts, -18000), "2013-01-01");
  assert.equal(localDay(ts, 32400), "2013-01-02");
});

test("chart parsing rejects empty or malformed responses", () => {
  assert.equal(parseYahooChart(null), null);
  assert.equal(parseYahooChart({ chart: { result: null } }), null);
  assert.equal(parseYahooChart({ chart: { result: [{ meta: {} }] } }), null);
});

test("reinvesting dividends switches every price to the adjusted close", () => {
  const p = parseYahooChart(chart());
  assert.ok(p);
  assert.deepEqual(stockPoints(p.days, false).map((x) => x.price), [19.6, 16.3]);
  assert.deepEqual(stockPoints(p.days, true).map((x) => x.price), [16.5, 16.3]);
  assert.ok(stockPoints(p.days, false).every((x) => x.source === "Yahoo"));
});

test("search keeps stocks and ETFs only, cleans names, and drops odd symbols", () => {
  const hits = parseStockSearch({
    quotes: [
      { symbol: "AAPL", quoteType: "EQUITY", longname: "Apple Inc.", exchDisp: "NASDAQ" },
      { symbol: "SAAPL=F", quoteType: "FUTURE", shortname: "Apple futures" },
      { symbol: "SPY", quoteType: "ETF", shortname: "  SPDR   S&P 500 ", exchDisp: "NYSE Arca" },
      { symbol: "BTC-USD", quoteType: "CRYPTOCURRENCY" },
      { symbol: "^GSPC", quoteType: "EQUITY" },
      { symbol: "brk-b", quoteType: "EQUITY", longname: "Berkshire Hathaway Inc." },
      null,
    ],
  });
  assert.deepEqual(hits.map((h) => h.symbol), ["AAPL", "SPY", "BRK-B"]);
  assert.equal(hits[1].name, "SPDR S&P 500");
  assert.deepEqual(parseStockSearch({}), []);
});

test("ticker validation", () => {
  for (const ok of ["AAPL", "aapl", "BRK-B", "BF.B", "A", "SPY"]) assert.equal(validateAddress(ok, "equity"), null, ok);
  for (const bad of ["", "  ", "^GSPC", "AAPL;DROP", "TOO-LONG-TICKER-X", "A B", "AAPL=F"]) assert.ok(validateAddress(bad, "equity"), bad);
  assert.equal(validateAddress("", "equity"), "Ticker is required");
  assert.equal(normalizeAddress(" aapl ", "equity"), "AAPL");
});

test("stocks may span decades; tokens keep the 6 year limit", () => {
  assert.equal(maxMonthsFor("equity"), 480);
  assert.equal(maxMonthsFor("ethereum"), 72);
  const base = { address: "AAPL", chain: "equity", amount: 100, basis: "month-end" };
  assert.deepEqual(validateRequest({ ...base, startMonth: "2013-01", endMonth: "2026-10" }), {});
  assert.deepEqual(validateRequest({ ...base, startMonth: "2000-01", endMonth: "2026-10" }), {});
  assert.ok(validateRequest({ ...base, startMonth: "1980-01", endMonth: "2026-10" }).endMonth, "more than 40 years is refused");
  assert.ok(validateRequest({ address: "0x0000000000000000000000000000000000000001", chain: "ethereum", amount: 100, basis: "month-end", startMonth: "2013-01", endMonth: "2026-10" }).endMonth);
  assert.equal(validateRequest({ ...base, address: "", startMonth: "2013-01", endMonth: "2013-02" }).address, "Ticker is required");
});

import { compressMonths } from "../src/lib/months.ts";

test("long gaps collapse into readable runs", () => {
  assert.deepEqual(compressMonths(["2013-01", "2013-02", "2013-03", "2013-07"]), ["2013-01 to 2013-03", "2013-07"]);
  assert.deepEqual(compressMonths(["2025-12", "2026-01", "2026-02"]), ["2025-12 to 2026-02"], "runs cross a year boundary");
  assert.deepEqual(compressMonths(["2013-03", "2013-01", "2013-01"]), ["2013-01", "2013-03"], "unsorted and repeated input is fine");
  assert.deepEqual(compressMonths([]), []);
  assert.deepEqual(compressMonths(["junk", "2020-05"]), ["2020-05"]);
  const gap = Array.from({ length: 191 }, (_, i) => new Date(Date.UTC(1998, i, 1)).toISOString().slice(0, 7));
  assert.deepEqual(compressMonths(gap), ["1998-01 to 2013-11"]);
});
