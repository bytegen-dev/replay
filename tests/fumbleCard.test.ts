import assert from "node:assert/strict";
import { test } from "node:test";
import { fumbleCardFileName, worstFumble } from "../src/lib/fumble/card.ts";
import type { ApiResult, ApiSell } from "../src/lib/fumble/service.ts";

const sell = (over: Partial<ApiSell>): ApiSell => ({ signature: "s", token: "T", soldAt: 1, tokens: 1, soldSol: 1, matchedTokens: 1, costSol: 1, profitSol: 0, status: "ok", fumbleUsd: 10, ...over });
const result = (sells: ApiSell[]) => ({ sells }) as unknown as ApiResult;

test("the biggest measured fumble is the worst one", () => {
  const worst = worstFumble(result([sell({ signature: "a", fumbleUsd: 50 }), sell({ signature: "b", fumbleUsd: 900 }), sell({ signature: "c", fumbleUsd: 120 })]));
  assert.equal(worst?.signature, "b");
});

test("a sell with no price history is never the worst, and no measured sell means none", () => {
  assert.equal(worstFumble(result([sell({ signature: "x", status: "unknown", fumbleUsd: 5000 }), sell({ signature: "y", fumbleUsd: 3 })]))?.signature, "y");
  assert.equal(worstFumble(result([sell({ status: "unknown" })])), null);
  assert.equal(worstFumble(result([])), null);
});

test("the picture is named for the wallet's ends and the day of the scan", () => {
  assert.equal(fumbleCardFileName({ wallet: "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj", scannedAt: 1_795_300_000 }), "replay-fumble-card-dfmx-xhzj-2026-11-21.png");
});
