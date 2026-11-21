import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fumbleFor, MIN_TRADE_SOL, priceAt, significantSells } from "../src/lib/fumble/fumble.ts";
import { matchLots } from "../src/lib/fumble/lots.ts";
import { parseTrades, WSOL, type HeliusTx } from "../src/lib/fumble/trades.ts";
import type { Candle, Trade } from "../src/lib/fumble/types.ts";

/* Real data, frozen: a Solana trader's swaps (one Jupiter and Titan mix) and the price history of the token they sold. */
const WALLET = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const WIN = "9msk9ehERMECbvsp3mvNabSXy2k7GNcrxJgdWfh7pump";
const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/fumble/${name}`, import.meta.url), "utf8"));
const txs = read("euris-txs.json") as HeliusTx[];
const prices = read("win-candles-hourly.json") as { solUsdAtSale: number; candles: Candle[] };

const trade = (over: Partial<Trade>): Trade => ({ side: "sell", mint: "M", tokens: 1000, sol: 1, time: 1000, signature: "s", ...over });

/** A transaction in the shape the parser reads, built by hand for the odd cases. */
function tx(over: { sol?: number; tokens?: Record<string, number>; wsol?: number; feePayer?: string; fee?: number; t?: number }): HeliusTx {
  const changes = Object.entries(over.tokens ?? {}).map(([mint, amount]) => ({ userAccount: WALLET, mint, rawTokenAmount: { tokenAmount: String(Math.round(amount * 1e6)), decimals: 6 } }));
  if (over.wsol) changes.push({ userAccount: WALLET, mint: WSOL, rawTokenAmount: { tokenAmount: String(Math.round(over.wsol * 1e9)), decimals: 9 } });
  return {
    signature: `sig${Math.random()}`,
    timestamp: over.t ?? 1,
    feePayer: over.feePayer ?? WALLET,
    fee: over.fee ?? 0,
    accountData: [{ account: WALLET, nativeBalanceChange: Math.round((over.sol ?? 0) * 1e9), tokenBalanceChanges: changes }],
  };
}

/* ------------------------------- parsing ------------------------------- */

test("every swap in the wallet's history becomes a trade, whichever router did it and however the provider labelled it", () => {
  // The history is fetched with no type filter: filtering to "SWAP" misses trades the provider mislabelled.
  const { trades, dropped } = parseTrades(WALLET, txs);
  assert.equal(txs.length, 100);
  assert.equal(trades.length, 28);
  assert.deepEqual(dropped, { noTokenMove: 69, multiToken: 0, noSolLeg: 3 }); // 67 of the 69 are pump.fun noise that never moved this wallet's tokens
  const bySource = (s: string) => trades.filter((t) => t.source === s).length;
  assert.equal(bySource("JUPITER"), 10);
  assert.equal(bySource("TITAN"), 14); // the provider gives no swap summary for these: the balance changes carry them
  assert.equal(bySource("SYSTEM_PROGRAM"), 4); // real buys the provider called plain SOL transfers
});

test("the sells come out with the right size, whether Jupiter or Titan routed them", () => {
  const sells = significantSells(parseTrades(WALLET, txs).trades);
  assert.equal(sells.length, 3);
  const [early, mid, late] = sells; // oldest first
  assert.equal(early.source, "TITAN");
  assert.ok(Math.abs(early.sol - 4.751) < 0.01, `early sold for ${early.sol}`);
  assert.equal(mid.source, "TITAN");
  assert.ok(Math.abs(mid.sol - 7.609) < 0.01, `mid sold for ${mid.sol}`);
  assert.equal(late.source, "JUPITER");
  assert.equal(late.mint, WIN);
  assert.ok(Math.abs(late.sol - 6.863) < 0.01, `late sold for ${late.sol}`);
  assert.ok(Math.abs(late.tokens - 16964972) < 5);
});

test("transactions that are not a token swap against SOL are counted as dropped, with the reason", () => {
  const history = [
    tx({ sol: -0.5 }), // a plain SOL transfer: no token moved
    tx({ tokens: { A: 100, B: -50 }, sol: -0.01 }), // token to token
    tx({ tokens: { A: 500 } }), // an airdrop: a token arrived, no SOL left
    tx({ tokens: { A: 100 }, sol: -0.0004 }), // dust: below the minimum SOL move
    tx({ tokens: { A: 100 }, sol: -1 }), // a real buy
  ];
  const { trades, dropped } = parseTrades(WALLET, history);
  assert.deepEqual(dropped, { noTokenMove: 1, multiToken: 1, noSolLeg: 2 });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].side, "buy");
});

test("wrapped SOL counts as SOL, and the fee the wallet paid is not part of the price", () => {
  // Sold 1000 tokens, 2 SOL arrive as wrapped SOL; the wallet also paid a 0.01 SOL fee.
  const sell = parseTrades(WALLET, [tx({ tokens: { A: -1000 }, wsol: 2, sol: -0.01, fee: 0.01 * 1e9 })]).trades[0];
  assert.equal(sell.side, "sell");
  assert.ok(Math.abs(sell.sol - 2) < 1e-9, `got ${sell.sol}`);
  // When someone else pays the fee, the wallet's SOL change is taken as it is.
  const buy = parseTrades(WALLET, [tx({ tokens: { A: 1000 }, sol: -1, feePayer: "someoneElse", fee: 5000 })]).trades[0];
  assert.ok(Math.abs(buy.sol - 1) < 1e-9, `got ${buy.sol}`);
});

/* ------------------------------- cost basis ------------------------------- */

test("a sell is matched to the oldest buys first, and a part sale leaves the rest of the lot for the next sell", () => {
  const trades = [
    trade({ side: "buy", tokens: 100, sol: 1, time: 1 }), // 0.01 SOL a token
    trade({ side: "buy", tokens: 100, sol: 4, time: 2 }), // 0.04 SOL a token
    trade({ side: "sell", tokens: 150, sol: 3, time: 3 }), // takes all of lot one and half of lot two
    trade({ side: "sell", tokens: 50, sol: 1, time: 4 }), // takes the rest of lot two
  ];
  const [a, b] = matchLots(trades);
  assert.ok(Math.abs(a.costSol - (1 + 50 * 0.04)) < 1e-9, `cost ${a.costSol}`);
  assert.equal(a.unmatchedTokens, 0);
  assert.ok(Math.abs(a.profitSol - (3 - 3)) < 1e-9);
  assert.ok(Math.abs(b.costSol - 2) < 1e-9);
  assert.ok(Math.abs(b.profitSol - (1 - 2)) < 1e-9);
});

test("tokens sold with no known buy are reported unmatched, and only the matched part counts for profit", () => {
  const [lot] = matchLots([trade({ side: "buy", tokens: 100, sol: 1, time: 1 }), trade({ side: "sell", tokens: 300, sol: 6, time: 2 })]);
  assert.equal(lot.matchedTokens, 100);
  assert.equal(lot.unmatchedTokens, 200);
  assert.ok(Math.abs(lot.costSol - 1) < 1e-9);
  assert.ok(Math.abs(lot.profitSol - (2 - 1)) < 1e-9); // 100 of the 300 tokens sold for 2 of the 6 SOL
});

test("different tokens keep separate lots", () => {
  const [lot] = matchLots([trade({ side: "buy", mint: "A", tokens: 100, sol: 1, time: 1 }), trade({ side: "sell", mint: "B", tokens: 100, sol: 2, time: 2 })]);
  assert.equal(lot.matchedTokens, 0);
  assert.equal(lot.unmatchedTokens, 100);
});

test("the real wallet's big sell is matched to its buys, and it was a loss", () => {
  const trades = parseTrades(WALLET, txs).trades;
  const lot = matchLots(trades).find((l) => l.sell.mint === WIN)!;
  assert.ok(lot.unmatchedTokens < 1, `unmatched ${lot.unmatchedTokens}`);
  assert.ok(lot.costSol > 20 && lot.costSol < 30, `cost ${lot.costSol}`);
  assert.ok(lot.profitSol < -15, `profit ${lot.profitSol}`); // paid about 24 SOL, got 6.86 back
});

/* -------------------------------- the fumble -------------------------------- */

test("the real sell: sold at the bottom, the price went about 8 times higher, so the fumble is about $3,300", () => {
  const sell = significantSells(parseTrades(WALLET, txs).trades).find((s) => s.mint === WIN)!;
  const f = fumbleFor(sell, prices.candles, { solUsd: prices.solUsdAtSale });
  assert.equal(f.status, "ok");
  if (f.status !== "ok") return;
  assert.ok(Math.abs(f.soldUsd - 6.863 * prices.solUsdAtSale) < 1, `sold for ${f.soldUsd}`);
  assert.ok(f.peakMultiple > 7.5 && f.peakMultiple < 9, `peak was ${f.peakMultiple}x`);
  assert.equal(new Date(f.peakAt * 1000).toISOString().slice(0, 13), "2026-11-21T14"); // the 14:00 hour
  assert.ok(f.fumbleUsd > 3250 && f.fumbleUsd < 3450, `fumble ${f.fumbleUsd}`);
  assert.ok(f.fumbleUsdClose <= f.fumbleUsd, "the close-based figure is never larger");
  assert.ok(Math.abs(f.fumbleSol - f.fumbleUsd / prices.solUsdAtSale) < 1e-9);
  assert.ok(Math.abs(f.peakValueUsd - (f.soldUsd + f.fumbleUsd)) < 1e-6, "sold value plus the fumble is the peak value");
});

test("a sell followed only by falling prices has no fumble", () => {
  const sell = trade({ tokens: 1000, sol: 1, time: 100 }); // 1 SOL at $50 = $50, so $0.05 a token
  const candles: Candle[] = [
    { t: 160, h: 0.04, l: 0.03, c: 0.035 },
    { t: 220, h: 0.03, l: 0.01, c: 0.02 },
  ];
  const f = fumbleFor(sell, candles, { solUsd: 50 });
  assert.equal(f.status, "ok");
  if (f.status === "ok") {
    assert.equal(f.fumbleUsd, 0);
    assert.equal(f.fumbleSol, 0);
    assert.ok(f.peakMultiple < 1);
  }
});

test("the candle the sale happened in is left out, so the sale's own wick cannot count", () => {
  const sell = trade({ tokens: 1000, sol: 1, time: 130 });
  const candles: Candle[] = [
    { t: 120, h: 5, l: 0.01, c: 0.05 }, // the sale's candle, with a huge wick
    { t: 180, h: 0.06, l: 0.04, c: 0.05 },
  ];
  const f = fumbleFor(sell, candles, { solUsd: 50 });
  assert.equal(f.status === "ok" && f.peakHigh, 0.06);
});

test("no price history after the sale means the fumble is unknown, not zero", () => {
  const sell = trade({ time: 500 });
  assert.equal(fumbleFor(sell, [{ t: 100, h: 1, l: 1, c: 1 }], { solUsd: 50 }).status, "no-price");
  assert.equal(fumbleFor(sell, [], { solUsd: 50 }).status, "no-price");
  assert.equal(fumbleFor(trade({ side: "buy" }), [{ t: 900, h: 1, l: 1, c: 1 }], { solUsd: 50 }).status, "no-price");
  assert.equal(fumbleFor(sell, [{ t: 900, h: 1, l: 1, c: 1 }], { solUsd: 0 }).status, "no-price");
});

test("candles too thin to trust can be ignored", () => {
  const sell = trade({ tokens: 1000, sol: 1, time: 100 }); // $0.05 a token
  const candles: Candle[] = [
    { t: 160, h: 9, l: 0.05, c: 0.05, v: 3 }, // a $3 print that spiked the price
    { t: 220, h: 0.2, l: 0.1, c: 0.15, v: 5000 },
  ];
  const all = fumbleFor(sell, candles, { solUsd: 50 });
  const trusted = fumbleFor(sell, candles, { solUsd: 50, minCandleVolumeUsd: 100 });
  assert.equal(all.status === "ok" && all.peakHigh, 9);
  assert.equal(trusted.status === "ok" && trusted.peakHigh, 0.2);
});

test("the SOL price comes from the candle the sale fell in, else the nearest one before it", () => {
  const sol: Candle[] = [
    { t: 60, h: 71, l: 69, c: 70 },
    { t: 120, h: 72, l: 70, c: 71 },
    { t: 180, h: 73, l: 71, c: 72 },
  ];
  assert.equal(priceAt(sol, 130), 71);
  assert.equal(priceAt(sol, 125), 71);
  assert.equal(priceAt(sol, 1000), 72);
  assert.equal(priceAt(sol, 10), 70); // before all of them: the first
  assert.equal(priceAt([], 10), null);
});

test("small sells are not scored", () => {
  const sells = significantSells([trade({ sol: MIN_TRADE_SOL - 0.01 }), trade({ sol: MIN_TRADE_SOL }), trade({ side: "buy", sol: 5 })]);
  assert.equal(sells.length, 1);
});
