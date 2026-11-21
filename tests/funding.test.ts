import assert from "node:assert/strict";
import { test } from "node:test";
import { describeFunding, fundingDefaultFor } from "../src/lib/funding.ts";

test("crypto pays funding on the whole position, stocks and commodities interest on the borrowed part", () => {
  assert.deepEqual(fundingDefaultFor("equity", "BTC-USD"), { apr: 10.95, base: "position" });
  assert.deepEqual(fundingDefaultFor("ethereum", "0x0000000000000000000000000000000000000001"), { apr: 10.95, base: "position" });
  assert.deepEqual(fundingDefaultFor("equity", "KO"), { apr: 5, base: "borrowed" });
  assert.deepEqual(fundingDefaultFor("equity", "GC=F"), { apr: 5, base: "borrowed" });
});

test("a default is described in words that say what it is charged on", () => {
  assert.equal(describeFunding(5, "borrowed"), "5% a year on the borrowed part");
  assert.equal(describeFunding(10.95, "position"), "10.95% a year on the whole position");
});
