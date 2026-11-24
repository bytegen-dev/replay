import assert from "node:assert/strict";
import { test } from "node:test";
import { bestTrade, worstFumble, worstRoundtrip } from "../src/lib/fumble/highlights.ts";
import type { ApiPosition, ApiResult, ApiSell } from "../src/lib/fumble/service.ts";

const sell = (over: Partial<ApiSell>): ApiSell => ({ signature: "s", token: "T", soldAt: 1, tokens: 1, soldSol: 1, matchedTokens: 1, costSol: 1, profitSol: 0, status: "ok", fumbleUsd: 10, ...over });
const position = (over: Partial<ApiPosition>): ApiPosition => ({ token: "T", openedAt: 1, closedAt: 2, closedBy: "p", costSol: 1, proceedsSol: 1, status: "ok", roundTripSol: 0, ...over });
const result = (sells: ApiSell[], positions: ApiPosition[] = []) => ({ sells, positions }) as unknown as ApiResult;

test("the best trade is the coin with the most profit over all its sells, and none when nothing made money", () => {
  const sells = [
    sell({ signature: "a1", token: "A", profitSol: 1, profitUsd: 100 }),
    sell({ signature: "a2", token: "A", profitSol: 2, profitUsd: 200 }),
    sell({ signature: "b1", token: "B", profitSol: 2.5, profitUsd: 250 }),
    sell({ signature: "c1", token: "C", profitSol: -4, profitUsd: -400 }),
  ];
  // A made 3 SOL over two sells, more than B's one sell of 2.5.
  assert.deepEqual(bestTrade(result(sells)), { token: "A", profitSol: 3, profitUsd: 300 });
  // A sell with no buy behind it says nothing about profit, and a loss is never the best.
  assert.equal(bestTrade(result([sell({ token: "D", matchedTokens: 0, profitSol: 50 }), sell({ token: "C", profitSol: -4 })])), null);
  assert.equal(bestTrade(result([])), null);
  // One sell without a dollar price makes the coin's dollar total unknown, not too low.
  assert.equal(bestTrade(result([sell({ token: "A", profitSol: 1, profitUsd: 100 }), sell({ token: "A", profitSol: 1, profitUsd: undefined })]))?.profitUsd, null);
});

test("the biggest measured fumble is the worst one", () => {
  const worst = worstFumble(result([sell({ signature: "a", fumbleUsd: 50 }), sell({ signature: "b", fumbleUsd: 900 }), sell({ signature: "c", fumbleUsd: 120 })]));
  assert.equal(worst?.signature, "b");
});

test("a sell with no price history is never the worst fumble, and no measured sell means none", () => {
  assert.equal(worstFumble(result([sell({ signature: "x", status: "unknown", fumbleUsd: 5000 }), sell({ signature: "y", fumbleUsd: 3 })]))?.signature, "y");
  assert.equal(worstFumble(result([sell({ status: "unknown" })])), null);
  assert.equal(worstFumble(result([])), null);
});

test("the worst roundtrip is the position that gave back the most, and none when nothing was given back", () => {
  const worst = worstRoundtrip(result([], [position({ closedBy: "a", roundTripSol: 1.2 }), position({ closedBy: "b", roundTripSol: 4 }), position({ closedBy: "c", roundTripSol: 0.3 })]));
  assert.equal(worst?.closedBy, "b");
  // A position that could not be priced is never the worst, and one that gave nothing back is not a roundtrip.
  assert.equal(worstRoundtrip(result([], [position({ closedBy: "x", status: "unknown", roundTripSol: 99 }), position({ closedBy: "y", roundTripSol: 0.5 })]))?.closedBy, "y");
  assert.equal(worstRoundtrip(result([], [position({ roundTripSol: 0 })])), null);
  assert.equal(worstRoundtrip(result([], [])), null);
});
