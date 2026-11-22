import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fetchHistory } from "../src/lib/fumble/helius.ts";
import { scanWallet } from "../src/lib/fumble/scan.ts";
import { memoryStore, type WalletStore } from "../src/lib/fumble/store.ts";
import type { HeliusTx } from "../src/lib/fumble/trades.ts";
import type { Candle } from "../src/lib/fumble/types.ts";

const WALLET = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const WIN = "9msk9ehERMECbvsp3mvNabSXy2k7GNcrxJgdWfh7pump";
const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/fumble/${name}`, import.meta.url), "utf8"));
const all = read("euris-txs.json") as HeliusTx[]; // newest first
const winPrices = read("win-candles-hourly.json") as { solUsdAtSale: number; candles: Candle[] };
const cut = Math.floor(all.length / 3);
const newer = all.slice(0, cut);
const older = all.slice(cut);

/** A history that serves `source` as if it were the wallet's whole history, stopping at `until` when given. */
const serve = (source: HeliusTx[], calls: { until?: string }[] = []) => async (_w: string, _onPage?: unknown, until?: string) => {
  calls.push({ until });
  const i = until ? source.findIndex((t) => t.signature === until) : -1;
  const txs = i >= 0 ? source.slice(0, i) : source;
  return { txs, pages: 1, complete: true, oldest: txs.length ? txs[txs.length - 1].timestamp : null };
};
const prices = async (m: string) => (m === WIN ? { candles: winPrices.candles, source: "fake" } : null);
const base = { prices, solUsd: async () => winPrices.solUsdAtSale, now: () => 1_795_300_000 };

/* ------------------------------ reading up to a known transaction ------------------------------ */

const page = (txs: HeliusTx[]) => new Response(JSON.stringify(txs), { status: 200 });

test("history stops at the known transaction and returns only what is newer", async () => {
  const pages = [all.slice(0, 5), all.slice(5, 10), all.slice(10, 15)];
  let n = 0;
  const known = all[7].signature;
  const h = await fetchHistory(WALLET, { apiKey: "k", untilSignature: known, fetchImpl: async () => page(pages[n++]), sleep: async () => {} });
  assert.equal(n, 2, "it did not read a third page");
  assert.deepEqual(h.txs.map((t) => t.signature), all.slice(0, 7).map((t) => t.signature));
  assert.equal(h.complete, true);
});

test("when the known transaction is the newest one, nothing new is returned", async () => {
  const h = await fetchHistory(WALLET, { apiKey: "k", untilSignature: all[0].signature, fetchImpl: async () => page(all.slice(0, 5)), sleep: async () => {} });
  assert.equal(h.txs.length, 0);
  assert.equal(h.complete, true);
});

test("without a known transaction the history is read as before", async () => {
  let n = 0;
  const pages = [all.slice(0, 3), []];
  const h = await fetchHistory(WALLET, { apiKey: "k", fetchImpl: async () => page(pages[n++]), sleep: async () => {} });
  assert.equal(h.txs.length, 3);
  assert.equal(h.complete, true);
});

/* ------------------------------------ saved wallets ------------------------------------ */

test("a first scan saves the wallet's trades and where the reading got to", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve(all), store });
  const saved = store.wallets.get(WALLET)!;
  assert.equal(saved.newestSig, all[0].signature);
  assert.equal(saved.oldestSig, all[all.length - 1].signature);
  assert.equal(saved.complete, true);
  assert.equal(saved.trades.length, 28);
  assert.equal(saved.transactions, all.length);
});

test("a rescan reads only what is newer than the newest saved transaction, and gets the same answer as a full scan", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve(older), store });
  const calls: { until?: string }[] = [];
  const rescan = await scanWallet(WALLET, { ...base, history: serve(all, calls), store });
  assert.equal(calls[0].until, older[0].signature, "it asked for only what is newer");
  const full = await scanWallet(WALLET, { ...base, history: serve(all) });
  assert.deepEqual(rescan.tradeList, full.tradeList);
  assert.equal(rescan.totalProfitSol, full.totalProfitSol);
  assert.equal(rescan.totalFumbleUsd, full.totalFumbleUsd);
  assert.equal(rescan.history.transactions, all.length);
  assert.equal(rescan.trades, 28);
});

test("the rescan saves the newer trades and moves the newest mark forward", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve(older), store });
  const before = store.wallets.get(WALLET)!;
  await scanWallet(WALLET, { ...base, history: serve(all), store });
  const after = store.wallets.get(WALLET)!;
  assert.equal(after.newestSig, all[0].signature);
  assert.equal(after.oldestSig, before.oldestSig, "the oldest mark stays where it was");
  assert.ok(after.trades.length >= before.trades.length);
  assert.equal(after.transactions, all.length);
});

test("a rescan shows the saved trades at once, before anything new has been read", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve(all), store });
  const seen: { partial: boolean; trades: number }[] = [];
  let firstShownBeforeHistory = false;
  let historyCalled = false;
  await scanWallet(WALLET, {
    ...base,
    store,
    history: async (...args) => {
      historyCalled = true;
      return serve(all)(...args);
    },
    onTrades: (t) => {
      if (!seen.length) firstShownBeforeHistory = !historyCalled;
      seen.push({ partial: t.partial, trades: t.trades.length });
    },
  });
  assert.ok(firstShownBeforeHistory, "the saved trades were sent before reading began");
  assert.equal(seen[0].partial, true);
  assert.ok(seen[0].trades > 0);
  assert.equal(seen[seen.length - 1].partial, false);
});

test("when time runs out before reaching the saved transactions, the saved state is left alone and only what was read is used", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve(older), store });
  const before = JSON.stringify(store.wallets.get(WALLET));
  const result = await scanWallet(WALLET, {
    ...base,
    store,
    history: async () => ({ txs: newer, pages: 1, complete: false, oldest: newer[newer.length - 1].timestamp }),
  });
  assert.equal(JSON.stringify(store.wallets.get(WALLET)), before);
  assert.equal(result.history.complete, false);
  assert.ok(result.tradeList.every((t) => t.time >= newer[newer.length - 1].timestamp));
});

test("a store that fails to load or save does not fail the scan", async () => {
  const broken: WalletStore = {
    load: async () => {
      throw new Error("db down");
    },
    save: async () => {
      throw new Error("db down");
    },
  };
  const result = await scanWallet(WALLET, { ...base, history: serve(all), store: broken });
  assert.equal(result.trades, 28);
});

test("a wallet with no transactions saves nothing", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve([]), store });
  assert.equal(store.wallets.size, 0);
});

test("a scan without a store works as before", async () => {
  const result = await scanWallet(WALLET, { ...base, history: serve(all) });
  assert.equal(result.trades, 28);
});
