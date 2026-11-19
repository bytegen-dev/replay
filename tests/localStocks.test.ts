import assert from "node:assert/strict";
import { test } from "node:test";
import { localStockCount, searchLocalStocks } from "../src/lib/localStocks.ts";

test("the saved list is large and searchable by ticker or name", () => {
  assert.ok(localStockCount > 5000);
  assert.equal(searchLocalStocks("aapl")[0].symbol, "AAPL");
  assert.equal(searchLocalStocks("apple")[0].symbol, "AAPL");
  assert.equal(searchLocalStocks("brk-b")[0].symbol, "BRK-B");
  assert.equal(searchLocalStocks("spy")[0].symbol, "SPY");
  assert.equal(searchLocalStocks("spy")[0].type, "ETF");
  assert.deepEqual(searchLocalStocks("   "), []);
});

test("a row's source links to the result's own page for it, else the source's home", async () => {
  const { sourceUrl } = await import("../src/lib/sourceLinks.ts");
  const sources = [{ label: "Nasdaq historical prices (daily)", url: "https://www.nasdaq.com/market-activity/stocks/aapl/historical" }];
  assert.equal(sourceUrl("Nasdaq", sources), "https://www.nasdaq.com/market-activity/stocks/aapl/historical");
  assert.equal(sourceUrl("Yahoo", sources), "https://finance.yahoo.com/");
  assert.equal(sourceUrl("manual", sources), null);
  assert.equal(sourceUrl("none", sources), null);
});
