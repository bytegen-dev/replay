import assert from "node:assert/strict";
import { test } from "node:test";
import { inSol, parseTrades, STABLES, type HeliusTx } from "../src/lib/fumble/trades.ts";
import { parsePyth, pythProvider, SOL_MINT, solPriceAt } from "../src/lib/fumble/prices.ts";
import type { Dropped } from "../src/lib/fumble/types.ts";

const W = "Wallet1111111111111111111111111111111111111";
const COIN = "CoinMint11111111111111111111111111111111111";
const USDC = [...STABLES][0];
const none = (): Dropped => ({ noTokenMove: 0, multiToken: 0, noSolLeg: 0 });

/** A swap in which the wallet's token balances change by `moves` (whole tokens, 6 decimals), and its SOL by `lamports`. */
const swap = (signature: string, time: number, moves: Record<string, number>, lamports = 0): HeliusTx => ({
  signature,
  timestamp: time,
  feePayer: "Other",
  fee: 5000,
  accountData: [
    { account: W, nativeBalanceChange: lamports, tokenBalanceChanges: Object.entries(moves).map(([mint, n]) => ({ userAccount: W, mint, rawTokenAmount: { tokenAmount: String(Math.round(n * 1e6)), decimals: 6 } })) },
  ],
});

test("a coin bought with USDC is a buy with the dollars paid, waiting for its SOL amount", () => {
  const { trades, dropped } = parseTrades(W, [swap("b", 100, { [COIN]: 1000, [USDC]: -50 })]);
  assert.equal(trades.length, 1);
  assert.deepEqual({ side: trades[0].side, mint: trades[0].mint, tokens: trades[0].tokens, usd: trades[0].usd, sol: trades[0].sol }, { side: "buy", mint: COIN, tokens: 1000, usd: 50, sol: 0 });
  assert.equal(dropped.multiToken, 0);
});

test("a coin sold for USDC is a sell with the dollars received", () => {
  const { trades } = parseTrades(W, [swap("s", 100, { [COIN]: -1000, [USDC]: 80 })]);
  assert.equal(trades[0].side, "sell");
  assert.equal(trades[0].usd, 80);
});

test("a swap of SOL for USDC is no coin trade: the stablecoin is the money, not a coin to track", () => {
  const { trades, dropped } = parseTrades(W, [swap("x", 100, { [USDC]: 100 }, -1e9)]);
  assert.equal(trades.length, 0);
  assert.equal(dropped.noTokenMove, 1);
});

test("a trade paid in SOL is as it was, with no dollar side", () => {
  const { trades } = parseTrades(W, [swap("b", 100, { [COIN]: 1000 }, -2e9)]);
  assert.equal(trades[0].sol, 2);
  assert.equal(trades[0].usd, undefined);
});

test("dust in stablecoins is not a trade", () => {
  const { trades, dropped } = parseTrades(W, [swap("d", 100, { [COIN]: 5, [USDC]: -0.01 })]);
  assert.equal(trades.length, 0);
  assert.equal(dropped.noSolLeg, 1);
});

test("inSol gives a stablecoin trade its SOL amount at the SOL price of the time, and leaves SOL trades alone", async () => {
  const { trades } = parseTrades(W, [swap("a", 100, { [COIN]: 10, [USDC]: -100 }), swap("b", 7300, { [COIN]: 10 }, -2e9)]);
  const d = none();
  const out = await inSol(trades, async (t) => (t < 3600 ? 100 : 200), d);
  assert.equal(out.length, 2);
  assert.equal(out[0].sol, 1);
  assert.equal(out[0].usd, undefined);
  assert.equal(out[1].sol, 2);
  assert.equal(d.noSolLeg, 0);
});

test("a stablecoin trade with no SOL price is left out and counted", async () => {
  const { trades } = parseTrades(W, [swap("a", 100, { [COIN]: 10, [USDC]: -100 })]);
  const d = none();
  const out = await inSol(trades, async () => null, d);
  assert.equal(out.length, 0);
  assert.equal(d.noSolLeg, 1);
});

/* ------------------------------ Pyth SOL/USD ------------------------------ */

test("Pyth's history is read into candles, skipping empty ones, and an error answer is none", () => {
  assert.deepEqual(parsePyth({ s: "ok", t: [120, 60], h: [101, 100], l: [99, 98], c: [100.5, 99.5] }), [
    { t: 60, h: 100, l: 98, c: 99.5 },
    { t: 120, h: 101, l: 99, c: 100.5 },
  ]);
  assert.equal(parsePyth({ s: "error" }), null);
  assert.equal(parsePyth(null), null);
});

test("the Pyth provider answers for SOL with the key as a bearer token, and says none for any other coin without calling", async () => {
  const seen: { url: string; auth: string | null }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify({ s: "ok", t: [60], h: [100], l: [99], c: [99.5] }), { status: 200 });
  };
  const get = pythProvider("k-123", { fetchImpl: fetchImpl as never, sleep: async () => {}, now: () => 0 }, 0);
  assert.equal(await get("SomeOtherCoin", 0, 3600), null);
  assert.equal(seen.length, 0);
  const candles = await get(SOL_MINT, 0, 3600);
  assert.equal(candles?.[0].c, 99.5);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].auth, "Bearer k-123");
  assert.ok(seen[0].url.includes("symbol=Crypto.SOL%2FUSD") && seen[0].url.includes("from=0") && seen[0].url.includes("to=3600"));
});

test("a failed Pyth call throws without the key in the error", async () => {
  const fetchImpl = async () => new Response("no", { status: 401 });
  const get = pythProvider("secret-key", { fetchImpl: fetchImpl as never, sleep: async () => {}, now: () => 0 }, 0);
  await assert.rejects(get(SOL_MINT, 0, 3600), (e: Error) => !e.message.includes("secret-key"));
});

test("solPriceAt tells which source answered, once for each hour looked up", async () => {
  const said: (string | null)[] = [];
  const price = solPriceAt(async () => ({ candles: [{ t: 0, h: 100, l: 99, c: 99.5 }], source: "pyth" }), (s) => said.push(s));
  await price(10);
  await price(20);
  await price(4000);
  assert.deepEqual(said, ["pyth", "pyth"]);
});

test("the stablecoins are the real USDC and USDT mints", () => {
  assert.deepEqual([...STABLES].sort(), ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);
});

test("a coin bought with USDT is a trade too", () => {
  const { trades } = parseTrades(W, [swap("t", 100, { [COIN]: 500, Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: -20 })]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].usd, 20);
});
