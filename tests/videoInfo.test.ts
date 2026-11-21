import assert from "node:assert/strict";
import { test } from "node:test";
import { videoInfo } from "../src/lib/videoInfo.ts";

test("a plain monthly buy says it is a spot buy and names the file after the trade", () => {
  const v = videoInfo({ asset: "Bitcoin", amount: 200, plan: "monthly", startMonth: "2020-01", endMonth: "2026-10" });
  assert.equal(v.title, "Bitcoin, $200 a month");
  assert.equal(v.subtitle, "Spot, monthly buys");
  assert.equal(v.fileName, "bitcoin-spot-200-monthly-2020-01-to-2026-10");
});

test("a leveraged run says its leverage and side, in the tag and in the file name", () => {
  const v = videoInfo({ asset: "Bitcoin", amount: 200, leverage: { times: 5, side: "long" }, startMonth: "2020-01", endMonth: "2026-10" });
  assert.equal(v.subtitle, "5x long, leveraged");
  assert.equal(v.fileName, "bitcoin-5x-long-200-monthly-2020-01-to-2026-10");
  const s = videoInfo({ asset: "Ethereum", amount: 1000, plan: "once", leverage: { times: 3, side: "short" } });
  assert.equal(s.title, "Ethereum, $1,000 once");
  assert.equal(s.subtitle, "3x short, leveraged");
  assert.equal(s.fileName, "ethereum-3x-short-1000-once");
});

test("1x counts as a plain buy, a single buy and reinvested dividends are said, and a currency run is its own kind", () => {
  assert.equal(videoInfo({ asset: "Apple", amount: 5000, plan: "once", leverage: { times: 1 } }).subtitle, "Spot, one buy");
  assert.equal(videoInfo({ asset: "S&P 500", amount: 500, reinvest: true }).subtitle, "Spot, monthly buys, dividends reinvested");
  const c = videoInfo({ asset: "USD to EUR", amount: 300, currency: true, startMonth: "2017-01", endMonth: "2026-10" });
  assert.equal(c.subtitle, "Currency buys");
  assert.equal(c.fileName, "usd-to-eur-currency-300-monthly-2017-01-to-2026-10");
});

test("another currency symbol and quarterly buys read naturally", () => {
  const v = videoInfo({ asset: "Gold", amount: 100000, symbol: "₦", plan: "quarterly" });
  assert.equal(v.title, "Gold, ₦100,000 every 3 months");
  assert.equal(v.subtitle, "Spot, every 3 months");
});
