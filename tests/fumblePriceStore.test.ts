import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryPriceStore, priceKey, savedPrices } from "../src/lib/fumble/priceStore.ts";
import { SOL_MINT, type PriceSeries } from "../src/lib/fumble/prices.ts";

const series = (source = "birdeye"): PriceSeries => ({ source, candles: [{ t: 100, h: 2, l: 1, c: 1.5, v: 10 }] });

test("a coin is fetched once, then answered from the store", async () => {
  const store = memoryPriceStore();
  let calls = 0;
  const get = savedPrices(async () => (calls++, series()), store);
  assert.equal((await get("A", 100, 1000))?.source, "birdeye");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(store.rows.size, 1);
  const again = await get("A", 100, 2000);
  assert.equal(calls, 1);
  assert.deepEqual(again?.candles, series().candles);
});

test("a request that reaches further back than the saved series, or runs on past its age, fetches again", async () => {
  const store = memoryPriceStore();
  let calls = 0;
  const get = savedPrices(async () => (calls++, series()), store, { maxAgeSeconds: 100 });
  await get("A", 100, 1000);
  await new Promise((r) => setTimeout(r, 0));
  await get("A", 50, 1010);
  assert.equal(calls, 2);
  await get("A", 50, 1500);
  assert.equal(calls, 3);
});

test("a coin with no price history is not saved", async () => {
  const store = memoryPriceStore();
  const get = savedPrices(async () => null, store);
  assert.equal(await get("A", 100, 1000), null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(store.rows.size, 0);
});

test("a store that fails to read or write does not fail the lookup", async () => {
  const broken = { load: async () => { throw new Error("down"); }, save: async () => { throw new Error("down"); } };
  const get = savedPrices(async () => series(), broken);
  assert.equal((await get("A", 100, 1000))?.source, "birdeye");
});

test("SOL is saved one hour at a time, and an hour that is over stays good", async () => {
  assert.equal(priceKey(SOL_MINT, 3600), `${SOL_MINT}@3600`);
  assert.equal(priceKey("A", 3600), "A");
  const store = memoryPriceStore();
  let calls = 0;
  const get = savedPrices(async () => (calls++, series()), store, { maxAgeSeconds: 10 });
  await get(SOL_MINT, 3600, 7200);
  await new Promise((r) => setTimeout(r, 0));
  await get(SOL_MINT, 3600, 7200);
  await get(SOL_MINT, 7200, 10800);
  assert.equal(calls, 2);
});
