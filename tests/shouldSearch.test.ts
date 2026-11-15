import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldSearch } from "../src/lib/tokenSearch.ts";

const EVM = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const POLICY = "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489";
const SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("names and tickers search", () => {
  for (const chain of ["ethereum", "cardano", "solana"] as const) {
    assert.equal(shouldSearch("pepe", chain), true);
    assert.equal(shouldSearch("  nmkr ", chain), true);
    assert.equal(shouldSearch("$tsla", chain), true);
  }
});

test("too short or empty does not search", () => {
  assert.equal(shouldSearch("", "ethereum"), false);
  assert.equal(shouldSearch("a", "ethereum"), false);
  assert.equal(shouldSearch("   ", "ethereum"), false);
});

test("a valid address for the chosen chain does not search (the details card handles it)", () => {
  assert.equal(shouldSearch(EVM, "base"), false);
  assert.equal(shouldSearch(POLICY, "cardano"), false);
  assert.equal(shouldSearch(POLICY + "4e4d4b52", "cardano"), false);
  assert.equal(shouldSearch(SOL, "solana"), false);
});

test("half-typed addresses do not search", () => {
  assert.equal(shouldSearch("0x6982", "ethereum"), false);
  assert.equal(shouldSearch("0x6982508145454Ce325dDbE47a25d4ec3", "ethereum"), false);
  assert.equal(shouldSearch("5dac8536653edc12f6f5e1045d", "cardano"), false);
});

test("a complete address from another chain does search, so it can be found and the chain switched", () => {
  assert.equal(shouldSearch(EVM, "cardano"), true);
  assert.equal(shouldSearch(POLICY, "ethereum"), true);
  assert.equal(shouldSearch(SOL, "base"), true);
});
