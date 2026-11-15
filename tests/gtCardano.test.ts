import assert from "node:assert/strict";
import { test } from "node:test";
import { fillGaps, mergeDailySeries, parsePools, pickUnit } from "../src/lib/gtCardano.ts";

const POLICY = "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489";
const UNIT = POLICY + "4e4d4b52";
const row = (base: string, address: string, liq: string, name = "NMKR / ADA") => ({
  attributes: { address, name, reserve_in_usd: liq },
  relationships: { base_token: { data: { id: `cardano_${base}` } } },
});

test("pickUnit finds the full asset id by policy, ignoring other tokens and quote-side matches", () => {
  const rows = [row("1b99aaaa6574436f696e", "aa", "1"), row(UNIT, "bb", "2")];
  assert.equal(pickUnit(rows, POLICY), UNIT);
  assert.equal(pickUnit(rows, POLICY.toUpperCase()), UNIT);
  assert.equal(pickUnit([row("1b99aaaa6574436f696e", "aa", "1")], POLICY), null);
  assert.equal(pickUnit(undefined, POLICY), null);
});

test("parsePools keeps base-side pools only, deepest first, capped at 4", () => {
  const rows = [
    row(UNIT, "aa01", "100"),
    row("other00", "aa02", "999", "BFD / NMKR"),
    row(UNIT, "aa03", "5000"),
    row(UNIT, "not hex!", "9000"),
    row(UNIT, "aa04", "10"),
    row(UNIT, "aa05", "20"),
    row(UNIT, "aa06", "30"),
  ];
  const pools = parsePools(rows, UNIT);
  assert.deepEqual(pools.map((p) => p.address), ["aa03", "aa01", "aa06", "aa05"]);
});

test("merge takes the day's most traded pool, and the deeper pool on a tie", () => {
  const deep = [{ date: "2025-06-10", price: 1, volume: 50 }, { date: "2025-06-11", price: 2, volume: 10 }];
  const thin = [{ date: "2025-06-10", price: 9, volume: 500 }, { date: "2025-06-11", price: 8, volume: 10 }, { date: "2025-06-12", price: 3 }];
  const m = mergeDailySeries([deep, thin]);
  assert.deepEqual(m.map((p) => [p.date, p.price]), [["2025-06-10", 9], ["2025-06-11", 2], ["2025-06-12", 3]]);
});

test("fillGaps never overrides the primary series", () => {
  const out = fillGaps(
    [{ date: "2025-11-20", price: 5, source: "CoinGecko" }],
    [{ date: "2025-06-10", price: 1, source: "GeckoTerminal" }, { date: "2025-11-20", price: 99, source: "GeckoTerminal" }],
  );
  assert.deepEqual(out.map((p) => [p.date, p.price, p.source]), [["2025-06-10", 1, "GeckoTerminal"], ["2025-11-20", 5, "CoinGecko"]]);
});
