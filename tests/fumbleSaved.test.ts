import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fetchHistory } from "../src/lib/fumble/helius.ts";
import { scanWallet } from "../src/lib/fumble/scan.ts";
import { memoryStore } from "../src/lib/fumble/store.ts";
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const serve = (source: HeliusTx[], calls: { until?: string; before?: string }[] = []) => async (_w: string, _onPage?: unknown, until?: string, before?: string, _stopWhen?: unknown) => {
  calls.push({ until, before });
  const b = before ? source.findIndex((t) => t.signature === before) : -1;
  const from = b >= 0 ? source.slice(b + 1) : source;
  const i = until ? from.findIndex((t) => t.signature === until) : -1;
  const txs = i >= 0 ? from.slice(0, i) : from;
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
  const calls: { until?: string; before?: string }[] = [];
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

test("when time runs out before reaching the saved transactions, what was read becomes the saved run, so there is no gap", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve(older), store });
  const result = await scanWallet(WALLET, {
    ...base,
    store,
    history: async () => ({ txs: newer, pages: 1, complete: false, oldest: newer[newer.length - 1].timestamp }),
  });
  const saved = store.wallets.get(WALLET)!;
  assert.equal(saved.newestSig, newer[0].signature);
  assert.equal(saved.oldestSig, newer[newer.length - 1].signature);
  assert.equal(saved.complete, false);
  assert.equal(result.history.complete, false);
  assert.ok(result.tradeList.every((t) => t.time >= newer[newer.length - 1].timestamp));
  assert.ok(saved.trades.every((t) => t.time >= newer[newer.length - 1].timestamp), "the older saved trades were let go");
});

test("after a catch-up that fell short, Load more reads on from the new run and ends with the whole history", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve(older), store });
  await scanWallet(WALLET, { ...base, store, history: async () => ({ txs: newer, pages: 1, complete: false, oldest: newer[newer.length - 1].timestamp }) });
  const calls: { until?: string; before?: string }[] = [];
  const more = await scanWallet(WALLET, { ...base, history: serve(all, calls), store }, { more: true });
  assert.equal(calls[0].before, newer[newer.length - 1].signature, "it carried on from the oldest of the new run");
  const full = await scanWallet(WALLET, { ...base, history: serve(all) });
  assert.deepEqual(more.tradeList, full.tradeList);
  assert.equal(more.history.complete, true);
});

const shallow = (source: HeliusTx[]) => async () => ({ txs: source, pages: 1, complete: false, oldest: source[source.length - 1].timestamp });

test("reading further back continues from the oldest saved transaction and joins up with what was saved", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: shallow(newer), store });
  const first = store.wallets.get(WALLET)!;
  assert.equal(first.complete, false);
  assert.equal(first.oldestSig, newer[newer.length - 1].signature);

  const calls: { until?: string; before?: string }[] = [];
  const more = await scanWallet(WALLET, { ...base, history: serve(all, calls), store }, { more: true });
  assert.equal(calls[0].before, newer[newer.length - 1].signature, "it started just older than the oldest saved transaction");
  assert.equal(calls[0].until, undefined, "it did not read what is new");

  const full = await scanWallet(WALLET, { ...base, history: serve(all) });
  assert.deepEqual(more.tradeList, full.tradeList);
  assert.equal(more.totalProfitSol, full.totalProfitSol);
  assert.equal(more.history.complete, true);
  assert.equal(more.history.transactions, all.length);

  const saved = store.wallets.get(WALLET)!;
  assert.equal(saved.complete, true);
  assert.equal(saved.oldestSig, all[all.length - 1].signature);
  assert.equal(saved.newestSig, first.newestSig, "the newest mark stays");
  assert.equal(saved.trades.length, 28);
});

test("a further-back read that runs out of time still saves how far it got", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: shallow(newer), store });
  const middle = older.slice(0, 20);
  const result = await scanWallet(
    WALLET,
    { ...base, store, history: async () => ({ txs: middle, pages: 1, complete: false, oldest: middle[middle.length - 1].timestamp }) },
    { more: true },
  );
  const saved = store.wallets.get(WALLET)!;
  assert.equal(saved.complete, false);
  assert.equal(saved.oldestSig, middle[middle.length - 1].signature);
  assert.equal(result.history.complete, false);
  assert.equal(result.history.oldest, middle[middle.length - 1].timestamp);
});

test("asking to go further back when the whole history is saved is an ordinary rescan", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: serve(all), store });
  const calls: { until?: string; before?: string }[] = [];
  const result = await scanWallet(WALLET, { ...base, history: serve(all, calls), store }, { more: true });
  assert.equal(calls[0].before, undefined);
  assert.equal(calls[0].until, all[0].signature);
  assert.equal(result.trades, 28);
});

test("asking to go further back with nothing saved is an ordinary first scan", async () => {
  const store = memoryStore();
  const calls: { until?: string; before?: string }[] = [];
  const result = await scanWallet(WALLET, { ...base, history: serve(all, calls), store }, { more: true });
  assert.deepEqual(calls[0], { until: undefined, before: undefined });
  assert.equal(result.trades, 28);
  assert.ok(store.wallets.get(WALLET));
});

test("the history says it can be read further only when it is saved and stopped short", async () => {
  const withStore = await scanWallet(WALLET, { ...base, history: shallow(newer), store: memoryStore() });
  assert.equal(withStore.history.extendable, true);
  const complete = await scanWallet(WALLET, { ...base, history: serve(all), store: memoryStore() });
  assert.equal(complete.history.extendable, undefined);
  const noStore = await scanWallet(WALLET, { ...base, history: shallow(newer) });
  assert.equal(noStore.history.extendable, undefined);
});

/* ------------------------------ reading a hundred trades at a time ------------------------------ */

test("history stops at the page where the caller says it has enough, and says the wallet has more", async () => {
  const pages = [all.slice(0, 5), all.slice(5, 10), all.slice(10, 15), all.slice(15, 20)];
  let n = 0;
  const h = await fetchHistory(WALLET, { apiKey: "k", stopWhen: (txs) => txs.length >= 10, fetchImpl: async () => page(pages[n++]), sleep: async () => {} });
  assert.equal(n, 2, "it did not read a third page");
  assert.equal(h.txs.length, 10);
  assert.equal(h.complete, false);
});

test("a first scan asks to stop once enough trades are found, and a rescan asks for no limit", async () => {
  const seen: { stop: boolean }[] = [];
  const history = async (_w: string, _p?: unknown, _u?: string, _b?: string, stopWhen?: (t: HeliusTx[]) => boolean) => {
    seen.push({ stop: !!stopWhen });
    return { txs: all, pages: 1, complete: true, oldest: all[all.length - 1].timestamp };
  };
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history, store });
  await scanWallet(WALLET, { ...base, history, store });
  assert.deepEqual(seen.map((s) => s.stop), [true, false], "first scan limited, the catch-up on what is new not");
});

test("the stop test counts trades of the minimum size against the target", async () => {
  let stop: ((t: HeliusTx[]) => boolean) | undefined;
  const history = async (_w: string, _p?: unknown, _u?: string, _b?: string, stopWhen?: (t: HeliusTx[]) => boolean) => {
    stop = stopWhen;
    return { txs: all, pages: 1, complete: true, oldest: all[all.length - 1].timestamp };
  };
  await scanWallet(WALLET, { ...base, history }, { target: 5 });
  assert.equal(stop!(all), true, "28 trades are more than 5");
  assert.equal(stop!([]), false, "no transactions, no trades");
  await scanWallet(WALLET, { ...base, history }, { target: 100 });
  assert.equal(stop!(all), false, "28 trades are fewer than 100");
});

test("reading further back also stops at the target, counting only what it reads this time", async () => {
  const store = memoryStore();
  await scanWallet(WALLET, { ...base, history: shallow(older), store });
  let stop: ((t: HeliusTx[]) => boolean) | undefined;
  await scanWallet(
    WALLET,
    {
      ...base,
      store,
      history: async (_w, _p, _u, _b, stopWhen) => {
        stop = stopWhen;
        return { txs: newer, pages: 1, complete: false, oldest: newer[newer.length - 1].timestamp };
      },
    },
    { more: true, target: 3 },
  );
  assert.ok(stop, "a limit was asked for");
  assert.equal(stop!([]), false);
  assert.equal(stop!(newer), true);
});

test("a transaction that comes back on two pages is kept once", async () => {
  // Page two starts with the transaction page one ended on.
  const pages = [all.slice(0, 5), all.slice(4, 9), []];
  let n = 0;
  const h = await fetchHistory(WALLET, { apiKey: "k", fetchImpl: async () => page(pages[n++]), sleep: async () => {} });
  assert.equal(h.txs.length, 9);
  assert.equal(new Set(h.txs.map((t) => t.signature)).size, 9);
});

test("the partial lists shown while reading never hold a transaction twice", async () => {
  const pages = [all.slice(0, 5), all.slice(4, 9), []];
  let n = 0;
  const seen: number[] = [];
  await fetchHistory(WALLET, { apiKey: "k", fetchImpl: async () => page(pages[n++]), sleep: async () => {}, onPage: (txs) => seen.push(txs.length - new Set(txs.map((t) => t.signature)).size) });
  assert.deepEqual(seen, [0, 0]);
});

test("the memory store keeps only the most recently saved wallets", async () => {
  const store = memoryStore(2);
  const saved = { trades: [], newestSig: "n", newestTime: 1, oldestSig: "o", oldestTime: 1, complete: false, transactions: 1, dropped: { noTokenMove: 0, multiToken: 0, noSolLeg: 0 } };
  await store.save("a", saved, []);
  await store.save("b", saved, []);
  await store.save("a", saved, []); // a is newest again
  await store.save("c", saved, []);
  assert.deepEqual([...store.wallets.keys()], ["a", "c"]);
});
