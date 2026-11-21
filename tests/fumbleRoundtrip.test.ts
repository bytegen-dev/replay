import assert from "node:assert/strict";
import { test } from "node:test";
import { findPositions, roundTripFor, type Position } from "../src/lib/fumble/roundtrip.ts";
import type { Candle, Trade } from "../src/lib/fumble/types.ts";

let n = 0;
const trade = (side: "buy" | "sell", tokens: number, sol: number, time: number, mint = "M"): Trade => ({ side, mint, tokens, sol, time, signature: `s${++n}` });
/** SOL is $100 throughout, so a coin at $0.10 a token is 0.001 SOL a token, and 1000 tokens are 1 SOL. */
const SOL: Candle[] = [{ t: 0, h: 100, l: 100, c: 100 }];
const candle = (t: number, h: number): Candle => ({ t, h, l: h / 2, c: h / 2 });
const only = (trades: Trade[]): Position => {
  const [p] = findPositions(trades);
  assert.ok(p, "a position was found");
  return p;
};

/* --------------------------------- the example --------------------------------- */

test("put in 1 SOL, up to 10 SOL at the top, sold at 1.5 SOL: 8.5 SOL round-tripped", () => {
  const pos = only([trade("buy", 1000, 1, 100), trade("sell", 1000, 1.5, 400)]);
  // $0.10 a token at the buy; $1.00 (10 SOL a thousand tokens) at the peak; $0.15 at the sale.
  const rt = roundTripFor(pos, [candle(160, 0.12), candle(220, 1.0), candle(280, 0.2), candle(340, 0.16)], SOL);
  assert.equal(rt.status, "ok");
  if (rt.status !== "ok") return;
  assert.ok(Math.abs(rt.peakProfitSol - 9) < 1e-9, `peak ${rt.peakProfitSol}`);
  assert.ok(Math.abs(rt.finalProfitSol - 0.5) < 1e-9);
  assert.ok(Math.abs(rt.roundTripSol - 8.5) < 1e-9, `round trip ${rt.roundTripSol}`);
  assert.ok(Math.abs(rt.roundTripUsd - 850) < 1e-6, `in dollars ${rt.roundTripUsd}`); // 8.5 SOL at $100
  assert.ok(Math.abs(rt.gaveBack - 8.5 / 9) < 1e-9);
  assert.equal(rt.peakAt, 220);
  assert.equal(rt.heldSeconds, 300);
});

test("selling at the top gives back nothing", () => {
  const pos = only([trade("buy", 1000, 1, 100), trade("sell", 1000, 10, 220)]);
  const rt = roundTripFor(pos, [candle(160, 0.5), candle(220, 1.0)], SOL);
  assert.equal(rt.status === "ok" && rt.roundTripSol, 0);
  assert.equal(rt.status === "ok" && rt.gaveBack, 0);
});

test("a position that never made money gave nothing back", () => {
  const pos = only([trade("buy", 1000, 1, 100), trade("sell", 1000, 0.2, 400)]);
  const rt = roundTripFor(pos, [candle(160, 0.09), candle(220, 0.05), candle(340, 0.02)], SOL);
  assert.equal(rt.status === "ok" && rt.roundTripSol, 0);
  assert.equal(rt.status === "ok" && rt.finalProfitSol, -0.8 + 0 || rt.status === "ok" && rt.finalProfitSol);
});

test("up 9 SOL and then out at a loss: all of the profit was given back, and the loss is its own number", () => {
  const pos = only([trade("buy", 1000, 1, 100), trade("sell", 1000, 0.5, 400)]);
  const rt = roundTripFor(pos, [candle(220, 1.0), candle(340, 0.06)], SOL);
  assert.equal(rt.status, "ok");
  if (rt.status !== "ok") return;
  assert.ok(Math.abs(rt.roundTripSol - 9) < 1e-9, `round trip ${rt.roundTripSol}`);
  assert.equal(rt.gaveBack, 1);
  assert.ok(Math.abs(rt.finalProfitSol - -0.5) < 1e-9);
});

test("part sales count: what was sold on the way up is kept, and only the rest was held through the fall", () => {
  // 1000 tokens for 1 SOL. Half sold at 0.004 SOL a token (2 SOL), the other half held to 0.01 a token (5 SOL) and sold at 0.002 (1 SOL).
  const pos = only([trade("buy", 1000, 1, 100), trade("sell", 500, 2, 200), trade("sell", 500, 1, 400)]);
  const rt = roundTripFor(pos, [candle(150, 0.2), candle(200, 0.4), candle(300, 1.0), candle(350, 0.3)], SOL);
  assert.equal(rt.status, "ok");
  if (rt.status !== "ok") return;
  assert.ok(Math.abs(rt.finalProfitSol - 2) < 1e-9, `final ${rt.finalProfitSol}`); // 3 back for 1 in
  assert.ok(Math.abs(rt.peakProfitSol - 6) < 1e-9, `peak ${rt.peakProfitSol}`); // 2 sold + 500 tokens at $1 (5 SOL) - 1 in
  assert.ok(Math.abs(rt.roundTripSol - 4) < 1e-9, `round trip ${rt.roundTripSol}`);
  assert.equal(rt.peakAt, 300);
});

test("several buys are one position: the cost is all of them, and the holdings grow with each", () => {
  const pos = only([trade("buy", 1000, 1, 100), trade("buy", 1000, 1, 200), trade("sell", 2000, 3, 500)]);
  assert.equal(pos.costSol, 2);
  // At $1 a token the two thousand tokens are 20 SOL: 18 SOL of profit. Sold for 3: 1 SOL kept.
  const rt = roundTripFor(pos, [candle(150, 0.12), candle(300, 1.0), candle(450, 0.2)], SOL);
  assert.equal(rt.status, "ok");
  if (rt.status !== "ok") return;
  assert.ok(Math.abs(rt.peakProfitSol - 18) < 1e-9, `peak ${rt.peakProfitSol}`);
  assert.ok(Math.abs(rt.roundTripSol - 17) < 1e-9);
});

test("a candle before the second buy is valued with only the first buy's tokens", () => {
  const pos = only([trade("buy", 1000, 1, 100), trade("buy", 1000, 1, 300), trade("sell", 2000, 2.2, 500)]);
  // The $1 candle at t=200 comes while only 1000 tokens are held: 10 SOL - 1 in = 9. The t=400 candle at $0.12 holds 2000 tokens: 2.4 - 2 = 0.4.
  const rt = roundTripFor(pos, [candle(200, 1.0), candle(400, 0.12)], SOL);
  assert.equal(rt.status === "ok" && Math.round(rt.peakProfitSol * 1e6) / 1e6, 9);
});

/* ------------------------------ which positions count ------------------------------ */

test("a position still open is not counted, and neither is one that sold tokens the history never shows bought", () => {
  assert.equal(findPositions([trade("buy", 1000, 1, 100)]).length, 0);
  assert.equal(findPositions([trade("sell", 1000, 2, 100)]).length, 0, "a sell with no buy");
  assert.equal(findPositions([trade("buy", 1000, 1, 100), trade("sell", 3000, 3, 200)]).length, 0, "sold three times what was bought");
});

test("selling nearly everything closes the position, because selling all leaves dust", () => {
  assert.equal(findPositions([trade("buy", 1000, 1, 100), trade("sell", 997, 2, 200)]).length, 1, "0.3% left");
  assert.equal(findPositions([trade("buy", 1000, 1, 100), trade("sell", 900, 2, 200)]).length, 0, "10% left is still open");
});

test("buying again after a close starts a new position, and each coin keeps its own", () => {
  const positions = findPositions([
    trade("buy", 1000, 1, 100),
    trade("sell", 1000, 2, 200),
    trade("buy", 500, 1, 300),
    trade("sell", 500, 0.5, 400),
    trade("buy", 100, 1, 150, "OTHER"),
    trade("sell", 100, 3, 250, "OTHER"),
  ]);
  assert.equal(positions.length, 3);
  assert.deepEqual(positions.map((p) => [p.mint, p.costSol, p.proceedsSol]), [["M", 1, 2], ["OTHER", 1, 3], ["M", 1, 0.5]]);
  assert.equal(positions[0].closedBy, positions[0].trades.at(-1)!.signature);
});

test("positions that put in less than the minimum are left out", () => {
  assert.equal(findPositions([trade("buy", 100, 0.05, 100), trade("sell", 100, 0.2, 200)]).length, 0);
  assert.equal(findPositions([trade("buy", 100, 0.05, 100), trade("sell", 100, 0.2, 200)], 0.01).length, 1);
});

/* ------------------------------ without prices ------------------------------ */

test("no price history during the hold, or no SOL price, is unknown and not zero", () => {
  const pos = only([trade("buy", 1000, 1, 100), trade("sell", 1000, 1.5, 400)]);
  assert.equal(roundTripFor(pos, [], SOL).status, "no-price");
  assert.equal(roundTripFor(pos, [candle(50, 1), candle(900, 1)], SOL).status, "no-price", "candles only outside the hold");
  assert.equal(roundTripFor(pos, [candle(220, 1)], []).status, "no-price");
});
