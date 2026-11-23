import assert from "node:assert/strict";
import { test } from "node:test";
import { missedTotals } from "../src/lib/fumble/missed.ts";
import type { ScannedPosition, ScannedSell } from "../src/lib/fumble/scan.ts";
import type { Trade } from "../src/lib/fumble/types.ts";

const trade = (signature: string, side: "buy" | "sell", mint = "A"): Trade => ({ signature, side, mint, tokens: 1, sol: 1, time: 1 });

const sell = (signature: string, sol: number, usd = sol * 100): ScannedSell =>
  ({
    lot: { sell: trade(signature, "sell") },
    profitUsd: null,
    source: null,
    fumble: { status: "ok", fumbleSol: sol, fumbleUsd: usd },
  }) as unknown as ScannedSell;

const unpricedSell = (signature: string): ScannedSell => ({ lot: { sell: trade(signature, "sell") }, profitUsd: null, source: null, fumble: { status: "no-price", reason: "x" } }) as unknown as ScannedSell;

const position = (sigs: string[], roundTripSol: number | null): ScannedPosition =>
  ({
    position: { trades: [trade("b", "buy"), ...sigs.map((s) => trade(s, "sell"))] },
    source: null,
    roundTrip: roundTripSol === null ? { status: "no-price", reason: "x" } : { status: "ok", roundTripSol, roundTripUsd: roundTripSol * 100 },
  }) as unknown as ScannedPosition;

test("a sell outside any closed position counts its fumble", () => {
  assert.deepEqual(missedTotals([sell("s1", 2)], []), { sol: 2, usd: 200 });
});

test("a closed position counts the larger of its round-trip and the fumbles of its sells, not both", () => {
  assert.deepEqual(missedTotals([sell("s1", 2)], [position(["s1"], 5)]), { sol: 5, usd: 500 });
  assert.deepEqual(missedTotals([sell("s1", 7)], [position(["s1"], 5)]), { sol: 7, usd: 700 });
});

test("the fumbles of all of a position's sells are added together before they are compared with its round-trip", () => {
  assert.deepEqual(missedTotals([sell("s1", 2), sell("s2", 3)], [position(["s1", "s2"], 4)]), { sol: 5, usd: 500 });
});

test("a position or sell with no price adds nothing, and the other measure still counts", () => {
  assert.deepEqual(missedTotals([unpricedSell("s1")], [position(["s1"], 4)]), { sol: 4, usd: 400 });
  assert.deepEqual(missedTotals([sell("s1", 3)], [position(["s1"], null)]), { sol: 3, usd: 300 });
  assert.deepEqual(missedTotals([unpricedSell("s1")], [position(["s1"], null)]), { sol: 0, usd: 0 });
});

test("positions and loose sells add up separately", () => {
  assert.deepEqual(missedTotals([sell("s1", 2), sell("loose", 1)], [position(["s1"], 5)]), { sol: 6, usd: 600 });
});
