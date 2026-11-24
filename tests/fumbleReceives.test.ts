import assert from "node:assert/strict";
import { test } from "node:test";
import { scanWallet, type ScanDeps } from "../src/lib/fumble/scan.ts";
import { memoryStore, type SavedWallet } from "../src/lib/fumble/store.ts";
import { parseTrades, type HeliusTx } from "../src/lib/fumble/trades.ts";

const W = "Wallet1111111111111111111111111111111111111";
const COIN = "CoinMint11111111111111111111111111111111111";
const OTHER = "OtherMint1111111111111111111111111111111111";
const NOW = 1_795_300_000;

/** A transaction in which the wallet's token balances change by `moves` (whole tokens, 6 decimals) and its SOL by `lamports`. */
const tx = (signature: string, time: number, moves: Record<string, number>, lamports = 0): HeliusTx => ({
  signature,
  timestamp: time,
  feePayer: "Other",
  fee: 5000,
  accountData: [{ account: W, nativeBalanceChange: lamports, tokenBalanceChanges: Object.entries(moves).map(([mint, n]) => ({ userAccount: W, mint, rawTokenAmount: { tokenAmount: String(Math.round(n * 1e6)), decimals: 6 } })) }],
});

const base = (txs: HeliusTx[], extra: Partial<ScanDeps> = {}): ScanDeps => ({
  history: async () => ({ txs, pages: 1, complete: true, oldest: txs[txs.length - 1].timestamp }),
  prices: async () => null,
  solUsd: async () => 100,
  now: () => NOW,
  ...extra,
});

test("tokens that arrive with nothing paid are kept as receives, and tokens that leave with nothing paid are dropped", () => {
  const { trades, receives, dropped } = parseTrades(W, [tx("in", 100, { [COIN]: 1000 }), tx("out", 200, { [COIN]: -400 }), tx("buy", 300, { [COIN]: 50 }, -1e9)]);
  assert.deepEqual(receives, [{ mint: COIN, tokens: 1000, time: 100, signature: "in" }]);
  assert.equal(dropped.noSolLeg, 1); // the transfer out
  assert.equal(trades.length, 1); // the real buy
});

test("a sell of tokens that arrived by transfer is all profit, and the scan says it was free", async () => {
  // 1000 tokens are sent to the wallet, then sold for 2 SOL. They cost nothing, so the profit is the whole 2 SOL. No price lookup is needed for that.
  const txs = [tx("sell", 2000, { [COIN]: -1000 }, 2e9), tx("in", 1000, { [COIN]: 1000 })];
  const asked: string[] = [];
  const r = await scanWallet(W, base(txs, { prices: async (m) => (asked.push(m), null) }));
  const lot = r.sells[0].lot;
  assert.equal(lot.matchedTokens, 1000);
  assert.equal(lot.freeTokens, 1000);
  assert.equal(lot.costSol, 0);
  assert.ok(Math.abs(r.totalProfitSol - 2) < 1e-9);
  assert.equal(r.freeSells, 1);
  assert.ok(Math.abs(r.freeProceedsSol - 2) < 1e-9);
});

test("a transfer in is used in order with the buys: the free tokens go first, then the bought ones at their cost", async () => {
  // 1000 arrive (at 1000); 100 are bought for 0.5 SOL (at 3000); all 1100 are sold for 10 SOL (at 9000). Free first: cost is only the 0.5 SOL, profit 9.5.
  const txs = [tx("sell", 9000, { [COIN]: -1100 }, 10e9), tx("buy", 3000, { [COIN]: 100 }, -0.5e9), tx("in", 1000, { [COIN]: 1000 })];
  const r = await scanWallet(W, base(txs));
  assert.equal(r.sells[0].lot.freeTokens, 1000);
  assert.ok(Math.abs(r.sells[0].lot.costSol - 0.5) < 1e-9);
  assert.ok(Math.abs(r.totalProfitSol - 9.5) < 1e-9);
  assert.ok(Math.abs(r.freeProceedsSol - (10 * 1000) / 1100) < 1e-9);
});

test("tokens sold that nothing in the history accounts for are free too, so every sell has a cost and none is left untraced", async () => {
  // No buy and no transfer in: the 500 tokens were bought before the history starts, or came some way that was not read.
  const r = await scanWallet(W, base([tx("sell", 2000, { [OTHER]: -500 }, 1e9)]));
  const lot = r.sells[0].lot;
  assert.equal(lot.matchedTokens, 500);
  assert.equal(lot.freeTokens, 500);
  assert.ok(Math.abs(r.totalProfitSol - 1) < 1e-9);
  assert.equal(r.freeSells, 1);
});

test("the transfers in are saved with the wallet, and a wallet saved before they were kept is read again from the start", async () => {
  const store = memoryStore();
  const reads: (string | undefined)[] = [];
  const history: ScanDeps["history"] = async (_w, _onPage, until) => {
    reads.push(until);
    const txs = [tx("sell", 2000, { [COIN]: -1000 }, 2e9), tx("in", 1000, { [COIN]: 1000 })];
    return { txs, pages: 1, complete: true, oldest: 1000 };
  };
  const deps: ScanDeps = { history, store, prices: async () => null, solUsd: async () => 100, now: () => NOW };

  // A first scan saves the transfer in with the trades.
  await scanWallet(W, deps);
  assert.deepEqual(store.wallets.get(W)?.receives?.map((r) => r.signature), ["in"]);
  assert.deepEqual(reads, [undefined]);

  // Scanning again reads only what is new (from the newest saved transaction)...
  await scanWallet(W, deps);
  assert.equal(reads[1], "sell");

  // ...but a wallet saved without receives (the old format) is not trusted: it is read from the start, and the new run is saved with them.
  const old: SavedWallet = { ...store.wallets.get(W)! };
  delete old.receives;
  store.wallets.set(W, old);
  await scanWallet(W, deps);
  assert.equal(reads[2], undefined);
  assert.deepEqual(store.wallets.get(W)?.receives?.map((r) => r.signature), ["in"]);
});
