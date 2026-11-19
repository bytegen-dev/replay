import assert from "node:assert/strict";
import { test } from "node:test";
import { MAJORS, isMajorSymbol, majorFor } from "../src/lib/majors.ts";

test("majors map Yahoo pairs to a ticker and name", () => {
  assert.equal(majorFor("btc-usd")?.ticker, "BTC");
  assert.equal(majorFor(" ETH-USD ")?.name, "Ethereum");
  assert.equal(isMajorSymbol("AAPL"), false);
  assert.ok(MAJORS.every((m) => m.symbol === `${m.ticker}-USD`));
});
