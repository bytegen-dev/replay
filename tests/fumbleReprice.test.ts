import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeCoinPricing } from "../src/lib/fumble/reprice.ts";
import { priceCoin, scanWallet, type ScanDeps } from "../src/lib/fumble/scan.ts";
import { toApiCoinPricing, toApiResult } from "../src/lib/fumble/service.ts";
import { sharedPrices, SOL_MINT, type PriceSeries } from "../src/lib/fumble/prices.ts";
import { memoryStore } from "../src/lib/fumble/store.ts";
import type { HeliusTx } from "../src/lib/fumble/trades.ts";

const W = "Wallet1111111111111111111111111111111111111";
const COIN = "CoinMint11111111111111111111111111111111111";
const OTHER = "OtherMint1111111111111111111111111111111111";
const NOW = 5000;

const tx = (signature: string, time: number, moves: Record<string, number>, lamports = 0): HeliusTx => ({
  signature,
  timestamp: time,
  feePayer: "Other",
  fee: 5000,
  accountData: [{ account: W, nativeBalanceChange: lamports, tokenBalanceChanges: Object.entries(moves).map(([mint, n]) => ({ userAccount: W, mint, rawTokenAmount: { tokenAmount: String(Math.round(n * 1e6)), decimals: 6 } })) }],
});

/** Each coin: bought for 1 SOL at 1000 and all sold for 2 SOL at 2000 (so a closed position). */
const txs = [
  tx("sell-coin", 2000, { [COIN]: -1000 }, 2e9),
  tx("buy-coin", 1000, { [COIN]: 1000 }, -1e9),
  tx("sell-other", 2100, { [OTHER]: -1000 }, 2e9),
  tx("buy-other", 1100, { [OTHER]: 1000 }, -1e9),
];

/** A flat SOL price of 100 dollars, and for a coin a price that jumps after the sale (so there is a fumble). */
const series = (mint: string): PriceSeries => ({
  source: "test",
  candles: Array.from({ length: 41 }, (_, i) => {
    const t = 900 + i * 100;
    const c = mint === SOL_MINT ? 100 : t < 2000 ? 0.1 : t < 2200 ? 0.2 : 0.6;
    return { t, h: c, l: c, c };
  }),
});
const everything: ScanDeps["prices"] = async (mint) => series(mint);
const exceptCoin: ScanDeps["prices"] = async (mint) => (mint === COIN ? null : series(mint));

const deps = (extra: Partial<ScanDeps> = {}): ScanDeps => ({
  history: async () => ({ txs, pages: 1, complete: true, oldest: 1000 }),
  prices: everything,
  solUsd: async () => 100,
  now: () => NOW,
  ...extra,
});

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);

test("pricing one coin again, and merging it in, gives the same page as a scan that priced it the first time", async () => {
  const store = memoryStore();
  const first = toApiResult(await scanWallet(W, deps({ store, prices: exceptCoin })), NOW);
  assert.equal(first.unknown, 1); // the coin's sell could not be priced
  assert.equal(first.positions.find((p) => p.token === COIN)?.status, "unknown");

  const priced = await priceCoin(W, COIN, { store, prices: everything, solUsd: async () => 100, now: () => NOW });
  assert.ok(priced);
  const merged = mergeCoinPricing(first, toApiCoinPricing(COIN, priced));

  const full = toApiResult(await scanWallet(W, deps()), NOW);
  assert.equal(merged.unknown, 0);
  assert.equal(merged.measured, full.measured);
  for (const k of ["totalFumbleSol", "totalFumbleUsd", "totalRoundTripSol", "totalRoundTripUsd", "totalMissedSol", "totalMissedUsd", "totalProfitSol", "totalProfitUsd"] as const) close(merged[k], full[k]);
  assert.deepEqual(merged.sells.map((s) => s.signature), full.sells.map((s) => s.signature));
  assert.deepEqual(merged.positions.map((p) => p.closedBy), full.positions.map((p) => p.closedBy));
  assert.ok(merged.totalFumbleSol > 0, "the coin has a fumble now");
});

test("pricing one coin again changes nothing about the other coins", async () => {
  const store = memoryStore();
  const first = toApiResult(await scanWallet(W, deps({ store, prices: exceptCoin })), NOW);
  const priced = await priceCoin(W, COIN, { store, prices: everything, solUsd: async () => 100, now: () => NOW });
  const merged = mergeCoinPricing(first, toApiCoinPricing(COIN, priced!));
  assert.deepEqual(merged.sells.filter((s) => s.token === OTHER), first.sells.filter((s) => s.token === OTHER));
  assert.deepEqual(merged.positions.filter((p) => p.token === OTHER), first.positions.filter((p) => p.token === OTHER));
});

test("a coin whose price still cannot be found stays unpriced, and the totals do not move", async () => {
  const store = memoryStore();
  const first = toApiResult(await scanWallet(W, deps({ store, prices: exceptCoin })), NOW);
  const priced = await priceCoin(W, COIN, { store, prices: exceptCoin, solUsd: async () => 100, now: () => NOW });
  assert.ok(priced);
  assert.ok(priced.sells.every((s) => s.fumble.status !== "ok"));
  const merged = mergeCoinPricing(first, toApiCoinPricing(COIN, priced));
  assert.equal(merged.unknown, first.unknown);
  close(merged.totalMissedSol, first.totalMissedSol);
  close(merged.totalFumbleSol, first.totalFumbleSol);
});

test("with no time left the coin is reported unpriced for that reason, not priced from nothing", async () => {
  const store = memoryStore();
  await scanWallet(W, deps({ store }));
  const asked: string[] = [];
  const priced = await priceCoin(W, COIN, { store, prices: async (m) => (asked.push(m), series(m)), solUsd: async () => 100, now: () => NOW, outOfTime: () => true });
  assert.ok(priced);
  assert.deepEqual(asked, []);
  assert.ok(priced.sells.every((s) => s.fumble.status === "no-price" && /ran out of time/.test(s.fumble.reason)));
});

test("there is nothing to price from when the wallet is not saved, or never traded the coin", async () => {
  const empty = memoryStore();
  assert.equal(await priceCoin(W, COIN, { store: empty, prices: everything, solUsd: async () => 100, now: () => NOW }), null);
  const store = memoryStore();
  await scanWallet(W, deps({ store }));
  assert.equal(await priceCoin(W, "NeverTraded11111111111111111111111111111111", { store, prices: everything, solUsd: async () => 100, now: () => NOW }), null);
  assert.equal(await priceCoin(W, COIN, { prices: everything, solUsd: async () => 100, now: () => NOW }), null); // no store at all
});

test("asking again on purpose looks again for a coin remembered as not found, while an ordinary ask still takes the remembered answer", async () => {
  let calls = 0;
  const get = sharedPrices(async () => (++calls === 1 ? null : series(COIN)));
  assert.equal(await get(COIN, 1000, NOW), null);
  assert.equal(await get(COIN, 1000, NOW), null); // remembered, not asked again
  assert.equal(calls, 1);
  assert.ok(await get(COIN, 1000, NOW, true)); // asked again, and found this time
  assert.equal(calls, 2);
  await get(COIN, 1000, NOW, true); // a series that was found is reused even by a retry
  assert.equal(calls, 2);
});
