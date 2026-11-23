import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { solPriceAt } from "../src/lib/fumble/prices.ts";
import { scanWallet, type ScanResult } from "../src/lib/fumble/scan.ts";
import { BusyError, createScanner, toApiResult, toApiTrades, type ScanEvent } from "../src/lib/fumble/service.ts";
import type { HeliusTx } from "../src/lib/fumble/trades.ts";
import type { Candle } from "../src/lib/fumble/types.ts";

const WALLET = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const OTHER = "4cXnf2z85UiZ5cyKsPMEULq1yufAtpkatmX4j4DBZqj2";
const WIN = "9msk9ehERMECbvsp3mvNabSXy2k7GNcrxJgdWfh7pump";
const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/fumble/${name}`, import.meta.url), "utf8"));
const txs = read("euris-txs.json") as HeliusTx[];
const winPrices = read("win-candles-hourly.json") as { solUsdAtSale: number; candles: Candle[] };

const history = async () => ({ txs, pages: 1, complete: true, oldest: txs[txs.length - 1].timestamp });
/** A real scan of the frozen wallet, with only the win token priced. */
const realScan = (wallet = WALLET, extra: Partial<Parameters<typeof scanWallet>[1]> = {}) =>
  scanWallet(wallet, { history, prices: async (m) => (m === WIN ? { candles: winPrices.candles, source: "fake" } : null), solUsd: async () => winPrices.solUsdAtSale, now: () => 1_795_300_000, ...extra });

/** A promise whose end the test controls. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const empty = (wallet: string): ScanResult => ({
  wallet,
  history: { transactions: 0, pages: 1, complete: true, oldest: null },
  dropped: { noTokenMove: 0, multiToken: 0, noSolLeg: 0 },
  trades: 0,
  tradeList: [],
  tokens: {},
  positions: [],
  totalRoundTripSol: 0,
  totalRoundTripUsd: 0,
  sells: [],
  unpriced: 0,
  totalFumbleUsd: 0,
  totalFumbleSol: 0,
  totalProfitSol: 0,
  totalProfitUsd: 0,
  partialSells: 0,
  worst: null,
  ranOutOfTime: false,
});

/* ------------------------------- the response shape ------------------------------- */

test("the response puts measured sells first, biggest fumble first, then the unknown ones oldest first", async () => {
  const api = toApiResult(await realScan(), 1_795_300_000);
  assert.equal(api.measured, 1);
  assert.equal(api.unknown, 2);
  assert.deepEqual(api.sells.map((s) => s.status), ["ok", "unknown", "unknown"]);
  assert.equal(api.sells[0].token, WIN);
  assert.ok(api.sells[1].soldAt < api.sells[2].soldAt);
  assert.equal(api.sells[1].reason, "no price history for this token");
  assert.ok(api.totalFumbleUsd > 3250 && api.totalFumbleUsd < 3450);
  assert.equal(api.tradeCount, 28);
  assert.deepEqual(api.coverage, { transactions: 100, pages: 1, complete: true, oldest: txs[txs.length - 1].timestamp });
});

test("a measured sell carries what the page needs, and an unknown one does not pretend to have a fumble", async () => {
  const api = toApiResult(await realScan(), 1_795_300_000);
  const [ok, unknown] = api.sells;
  assert.ok(ok.soldUsd! > 400 && ok.peakMultiple! > 7 && ok.fumbleUsd! > 3000 && ok.peakAt! > ok.soldAt);
  assert.equal(ok.source, "fake");
  assert.ok(ok.costSol > 20 && ok.matchedTokens > 0);
  assert.equal(unknown.fumbleUsd, undefined);
  assert.equal(unknown.peakMultiple, undefined);
});

test("the response is plain JSON: it survives a round trip unchanged", async () => {
  const api = toApiResult(await realScan(), 1_795_300_000);
  assert.deepEqual(JSON.parse(JSON.stringify(api)), api);
});

/* ------------------------------- the scanner's guard rails ------------------------------- */

test("a finished scan is reused until it is too old, then it is run again", async () => {
  let t = 1000;
  let runs = 0;
  const s = createScanner({ run: async (w) => (runs++, empty(w)), now: () => t, ttlSeconds: 600 });
  assert.equal((await s.scan(WALLET)).cached, false);
  assert.equal((await s.scan(WALLET)).cached, true);
  assert.equal(runs, 1);
  assert.ok(s.peek(WALLET));
  t += 601;
  assert.equal(s.peek(WALLET), null);
  assert.equal((await s.scan(WALLET)).cached, false);
  assert.equal(runs, 2);
});

test("two people scanning the same wallet at once share one run, and both see its progress", async () => {
  const gate = deferred<void>();
  let runs = 0;
  const s = createScanner({
    run: async (w, emit) => {
      runs++;
      emit({ type: "progress", stage: "history", done: 0, total: 0 });
      await gate.promise;
      emit({ type: "progress", stage: "done", done: 1, total: 1 });
      return empty(w);
    },
  });
  const stage = (e: ScanEvent) => (e.type === "progress" ? e.stage : e.type);
  const a: string[] = [];
  const b: string[] = [];
  const first = s.scan(WALLET, (e) => a.push(stage(e)));
  await Promise.resolve();
  const second = s.scan(WALLET, (e) => b.push(stage(e)));
  assert.equal(s.active(), 1);
  gate.resolve();
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(runs, 1);
  assert.equal(r1.result, r2.result);
  assert.deepEqual(a, ["history", "done"]);
  assert.deepEqual(b, ["done"], "the second joined after the first event");
});

test("when too many different scans are running, the next is turned away, and works once there is room", async () => {
  const gate = deferred<void>();
  const s = createScanner({ run: async (w) => (await gate.promise, empty(w)), maxActive: 1 });
  const first = s.scan(WALLET);
  await Promise.resolve();
  await assert.rejects(s.scan(OTHER), BusyError);
  gate.resolve();
  await first;
  assert.equal(s.active(), 0);
  assert.equal((await s.scan(OTHER)).cached, false);
});

test("a scan that fails is not kept: the next try runs again, and the slot is freed", async () => {
  let runs = 0;
  const s = createScanner({
    run: async (w) => {
      if (++runs === 1) throw new Error("helius down");
      return empty(w);
    },
    maxActive: 1,
  });
  await assert.rejects(s.scan(WALLET), /helius down/);
  assert.equal(s.active(), 0);
  assert.equal(s.peek(WALLET), null);
  assert.equal((await s.scan(WALLET)).cached, false);
  assert.equal(runs, 2);
});

test("the cache is bounded: the oldest scan goes when it is full", async () => {
  const s = createScanner({ run: async (w) => empty(w), maxCached: 2 });
  await s.scan("w1");
  await s.scan("w2");
  await s.scan("w3");
  assert.equal(s.peek("w1"), null);
  assert.ok(s.peek("w2") && s.peek("w3"));
});

/* ------------------------------- the scan's time limit ------------------------------- */

test("when time runs out the tokens not yet priced are reported unknown, and the coins with the most money in them are priced first", async () => {
  const order: string[] = [];
  let calls = 0;
  const result = await realScan(WALLET, {
    prices: async (mint) => (mint !== SOL_MINT && order.push(mint), { candles: winPrices.candles, source: "fake" }),
    outOfTime: () => calls++ >= 2, // asked once before the SOL price and once before each coin: time is up after the first coin
  });
  assert.equal(order.length, 1);
  assert.equal(result.ranOutOfTime, true);
  assert.equal(order[0], WIN, "the first coin priced is the one with the most money in it: a 27 SOL position, bigger than any single sale");
  const late = result.sells.filter((s) => s.lot.sell.mint !== order[0]);
  assert.equal(late.length, 2);
  assert.ok(late.every((s) => s.fumble.status === "no-price" && /ran out of time/.test((s.fumble as { reason: string }).reason)));
  assert.equal(toApiResult(result, 1).ranOutOfTime, true);
});

test("a scan that finishes in time says so", async () => {
  assert.equal((await realScan()).ranOutOfTime, false);
});

/* ------------------------------- the SOL price helper ------------------------------- */

test("a failed SOL price lookup is not remembered, so a hiccup does not poison the hour", async () => {
  let calls = 0;
  const sol = solPriceAt(async (_m, from) => (calls++ === 0 ? null : { candles: [{ t: from, h: 71, l: 69, c: 70 }], source: "x" }));
  assert.equal(await sol(3700), null);
  assert.equal(await sol(3800), 70);
  assert.equal(calls, 2);
  assert.equal(await sol(3900), 70);
  assert.equal(calls, 2, "a good answer is kept");
});

/* ------------------------------- the trade list ------------------------------- */

test("the trade list is newest first, buys and sells of a meaningful size, and goes out before any price lookup", async () => {
  const order: string[] = [];
  const got: { list?: ReturnType<typeof toApiTrades> } = {};
  const result = await realScan(WALLET, {
    onTrades: (t) => (order.push("trades"), (got.list = toApiTrades(WALLET, t))),
    prices: async (m) => (order.push("price"), m === WIN ? { candles: winPrices.candles, source: "fake" } : null),
  });
  assert.equal(order[0], "trades", "the list is sent before prices are looked up");
  assert.ok(got.list);
  const list = got.list!;
  assert.ok(list.trades.length > 3 && list.trades.length <= 28, `${list.trades.length} trades of 0.1 SOL or more`);
  assert.ok(list.trades.every((t) => t.sol >= 0.1));
  assert.ok(list.trades.every((t, i) => i === 0 || list.trades[i - 1].time >= t.time), "newest first");
  assert.ok(list.trades.some((t) => t.side === "buy") && list.trades.some((t) => t.side === "sell"));
  assert.equal(list.tradeCount, 28);
  assert.deepEqual(toApiResult(result, 1).trades, list.trades);
});

test("someone who joins a scan that already sent its trade list is sent it straight away", async () => {
  const gate = deferred<void>();
  const list = toApiTrades(WALLET, { history: { transactions: 1, pages: 1, complete: true, oldest: 1 }, dropped: { noTokenMove: 0, multiToken: 0, noSolLeg: 0 }, tradeCount: 0, trades: [], tokens: {}, partial: false, pnl: {} });
  const s = createScanner({
    run: async (w, emit) => {
      emit({ type: "trades", data: list });
      await gate.promise;
      return empty(w);
    },
  });
  const first = s.scan(WALLET);
  await Promise.resolve();
  const seen: string[] = [];
  const second = s.scan(WALLET, (e) => seen.push(e.type));
  assert.deepEqual(seen, ["trades"]);
  gate.resolve();
  await Promise.all([first, second]);
});

/* ------------------------------- round-trips in the scan ------------------------------- */

import { SOL_MINT } from "../src/lib/fumble/prices.ts";

const priceSol = (m: string) => (m === SOL_MINT ? { candles: [{ t: 0, h: 67, l: 67, c: 67 }], source: "fake" } : m === WIN ? { candles: winPrices.candles, source: "fake" } : null);

test("the scan finds the wallet's closed positions and measures the round-trip of the ones it can price", async () => {
  const lookups: string[] = [];
  const result = await realScan(WALLET, { prices: async (m) => (lookups.push(m), priceSol(m)) });
  assert.equal(result.positions.length, 2, "the coin bought 20 times and the one bought once; the third sale has no buy in the history");
  const win = result.positions.find((p) => p.position.mint === WIN)!;
  assert.equal(win.roundTrip.status, "ok");
  if (win.roundTrip.status === "ok") {
    assert.ok(win.roundTrip.finalProfitSol < -15, `final ${win.roundTrip.finalProfitSol}`); // paid about 27 SOL, got 6.86 back
    assert.equal(win.roundTrip.roundTripSol, win.roundTrip.peakProfitSol, "it ended at a loss, so all of its peak profit was given back");
  }
  const other = result.positions.find((p) => p.position.mint !== WIN)!;
  assert.equal(other.roundTrip.status, "no-price");
  assert.ok(result.totalRoundTripSol >= 0);
  assert.equal(lookups.filter((m) => m === SOL_MINT).length, 1, "the SOL price is fetched once for all positions");
  assert.equal(new Set(lookups.filter((m) => m !== SOL_MINT)).size, lookups.filter((m) => m !== SOL_MINT).length, "one lookup per coin, shared by its fumbles and its round-trips");
});

test("a coin is priced from its first buy, so the hold is covered, not only what came after the sale", async () => {
  const from: Record<string, number> = {};
  const result = await realScan(WALLET, { prices: async (m, f) => ((from[m] = f), priceSol(m)) });
  const win = result.positions.find((p) => p.position.mint === WIN)!;
  assert.equal(from[WIN], win.position.openedAt);
  assert.ok(win.position.openedAt < result.sells.find((s) => s.lot.sell.mint === WIN)!.lot.sell.time);
});

test("positions of coins not priced in time are unknown, with the reason", async () => {
  const result = await realScan(WALLET, { prices: async (m) => priceSol(m), outOfTime: () => true });
  assert.ok(result.positions.length > 0);
  assert.ok(result.positions.every((p) => p.roundTrip.status === "no-price" && /ran out of time/.test((p.roundTrip as { reason: string }).reason)));
  assert.equal(result.totalRoundTripSol, 0);
});

test("the response lists measured positions first, biggest round-trip first, then the unknown ones", async () => {
  const api = toApiResult(await realScan(WALLET, { prices: async (m) => priceSol(m) }), 1);
  assert.deepEqual(api.positions.map((p) => p.status), ["ok", "unknown"]);
  const [ok] = api.positions;
  assert.equal(ok.token, WIN);
  assert.ok(ok.roundTripSol! >= 0 && ok.peakProfitSol! >= ok.roundTripSol! && ok.gaveBack! >= 0 && ok.gaveBack! <= 1);
  assert.ok(api.trades.some((t) => t.signature === ok.closedBy), "the position's closing sell is one of the listed trades");
  assert.equal(api.positions[1].roundTripSol, undefined);
  assert.equal(api.totalRoundTripSol, ok.roundTripSol);
  assert.equal(api.totalRoundTripUsd, ok.roundTripUsd);
  const measuredSells = api.sells.filter((x) => x.status === "ok");
  assert.ok(Math.abs(api.totalFumbleSol - measuredSells.reduce((n, x) => n + x.fumbleSol!, 0)) < 1e-9, "the SOL total is the sum of the sells' SOL fumbles");
  assert.ok(api.totalFumbleSol > 40 && api.totalFumbleSol < 60, `about 49 SOL, got ${api.totalFumbleSol}`);
  assert.ok(Math.abs(ok.roundTripUsd! - ok.roundTripSol! * 67) < 1e-6, "dollars are the SOL amount at the SOL price when the position closed (the fake SOL price is $67)");
  assert.deepEqual(JSON.parse(JSON.stringify(api)), api);
});

/* ------------------------------- coin names in the scan ------------------------------- */

const names = new Map([[WIN, { symbol: "win", name: "it only takes one win" }]]);

test("the trade list carries each coin's name and ticker, and the finished scan does too", async () => {
  const got: { list?: ReturnType<typeof toApiTrades> } = {};
  const result = await realScan(WALLET, { tokens: async () => names, onTrades: (t) => (got.list = toApiTrades(WALLET, t)) });
  assert.deepEqual(got.list?.tokens[WIN], names.get(WIN));
  assert.equal(got.list?.tokens["JAgJqo5Xxz55b51Zod2Pun21PnoLQDKZmyonxVvGjZJV"], undefined, "no metadata, no entry");
  assert.deepEqual(toApiResult(result, 1).tokens, got.list?.tokens);
});

test("the name lookup runs alongside the price lookups: the trade list waits for its names, the prices do not", async () => {
  const gate = deferred<void>();
  const seen: string[] = [];
  const scan = realScan(WALLET, {
    tokens: async () => (await gate.promise, names),
    onTrades: () => seen.push("trades"),
    prices: async (m) => (seen.push("price"), m === WIN ? { candles: winPrices.candles, source: "fake" } : null),
  });
  for (let i = 0; i < 40; i++) await Promise.resolve();
  assert.ok(seen.filter((e) => e === "price").length >= 3, "the coins were priced while the names were still out");
  assert.ok(!seen.includes("trades"), "the list waits for its names");
  gate.resolve();
  const result = await scan;
  assert.deepEqual(seen.filter((e) => e === "trades"), ["trades"]);
  assert.deepEqual(result.tokens[WIN], names.get(WIN));
});

test("a failed name lookup does not stop the scan: the list goes out with no names", async () => {
  const got: { list?: ReturnType<typeof toApiTrades> } = {};
  const result = await realScan(WALLET, {
    tokens: async () => {
      throw new Error("helius down");
    },
    onTrades: (t) => (got.list = toApiTrades(WALLET, t)),
  });
  assert.deepEqual(got.list?.tokens, {});
  assert.equal(result.sells.length, 3);
});

/* ------------------------------- profit in the scan ------------------------------- */

test("the wallet's realized profit is what its sells brought in minus what those coins cost, in SOL and in dollars", async () => {
  const result = await realScan(WALLET, { prices: async (m) => priceSol(m) });
  // win: paid 27.29 SOL, sold for 6.86; iNu: paid 5.01, sold for 4.75; the third sale's coins were bought before the history, so it adds nothing.
  assert.ok(result.totalProfitSol < -20.5 && result.totalProfitSol > -20.9, `profit ${result.totalProfitSol} SOL`);
  assert.ok(Math.abs(result.totalProfitUsd - result.totalProfitSol * 67) < 1e-6, "dollars are the SOL profit at the SOL price of the sale (the fake price is $67)");
  const byMint = new Map(result.sells.map((x) => [x.lot.sell.mint, x]));
  const win = byMint.get(WIN)!;
  assert.ok(win.lot.profitSol < -20 && win.profitUsd !== null && Math.abs(win.profitUsd - win.lot.profitSol * 67) < 1e-6);
  assert.equal(result.partialSells, 1, "one sale had no buy in the history at all");
});

test("without a SOL price the profit is still known in SOL, and the dollar figures are left out, not guessed", async () => {
  const result = await realScan(WALLET, { prices: async (m) => (m === WIN ? { candles: winPrices.candles, source: "fake" } : null), solUsd: async () => null });
  assert.ok(result.totalProfitSol < -20);
  assert.equal(result.totalProfitUsd, 0);
  assert.ok(result.sells.every((x) => x.profitUsd === null));
  const api = toApiResult(result, 1);
  assert.ok(api.sells.every((x) => x.profitUsd === undefined));
});

test("when the main SOL price series is missing but the per-hour price is there, the profit still gets its dollar value from it", async () => {
  const result = await realScan(WALLET, { prices: async (m) => (m === WIN ? { candles: winPrices.candles, source: "fake" } : null) });
  const win = result.sells.find((x) => x.lot.sell.mint === WIN)!;
  assert.ok(win.profitUsd !== null, "the priced sell has a dollar profit");
  assert.ok(Math.abs(win.profitUsd! - win.lot.profitSol * winPrices.solUsdAtSale) < 1e-6, "worked out at the SOL price the fumble used");
  assert.ok(result.totalProfitUsd < -1300);
});

test("the response carries each sell's profit and the wallet's totals", async () => {
  const api = toApiResult(await realScan(WALLET, { prices: async (m) => priceSol(m) }), 1);
  assert.equal(api.totalProfitSol, api.sells.reduce((n, x) => n + x.profitSol, 0));
  const win = api.sells.find((x) => x.token === WIN)!;
  assert.ok(win.profitSol < -20 && win.profitUsd! < -1300 && win.matchedTokens > 0);
  assert.equal(api.partialSells, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(api)), api);
});

/* ------------------------------- trades while the history is read ------------------------------- */

import type { TradeList } from "../src/lib/fumble/scan.ts";

/** The fixture's history in the order the API gives it (newest first), read in two pages. */
const newestFirst = [...txs].sort((a, b) => b.timestamp - a.timestamp);

test("trades appear after each page, growing, with no profit yet; then the complete list arrives with each sell's profit", async () => {
  const events: { list: TradeList; at: string }[] = [];
  const progress: { stage: string; done: number }[] = [];
  const asked: string[][] = [];
  await realScan(WALLET, {
    history: async (_w, onPage) => {
      onPage?.(newestFirst.slice(0, 30), 1);
      onPage?.(newestFirst.slice(0, 70), 2);
      return { txs: newestFirst, pages: 3, complete: true, oldest: newestFirst.at(-1)!.timestamp };
    },
    tokens: async (mints) => (asked.push(mints), new Map(mints.map((m) => [m, { symbol: m.slice(0, 4) }]))),
    onTrades: (list) => events.push({ list, at: list.partial ? "partial" : "complete" }),
    onProgress: (p) => progress.push({ stage: p.stage, done: p.done }),
  });
  const partials = events.filter((e) => e.at === "partial").map((e) => e.list);
  const complete = events.filter((e) => e.at === "complete");
  assert.ok(partials.length >= 2, "at least one event per page");
  assert.equal(complete.length, 1);
  assert.ok(partials.every((p) => p.partial && Object.keys(p.pnl).length === 0), "no profit while pages may still be missing");
  assert.ok(partials[0].history.transactions === 30 && partials.some((p) => p.history.transactions === 70));
  assert.ok(partials.every((p) => !p.history.complete));
  assert.ok(partials.at(-1)!.trades.length >= partials[0].trades.length, "the list only grows");
  assert.equal(complete[0].list.partial, false);
  assert.equal(complete[0].list.history.complete, true);
  assert.equal(Object.keys(complete[0].list.pnl).length, 3, "the three sells, with their profit");
  const win = complete[0].list.trades.find((t) => t.mint === WIN && t.side === "sell")!;
  assert.ok(complete[0].list.pnl[win.signature].profitSol < -20, "known without any price lookup");
  assert.ok(progress.some((p) => p.stage === "history" && p.done === 30) && progress.some((p) => p.stage === "history" && p.done === 70), "progress says how many transactions were read");
  // each coin's name is asked for once, however many events mention it
  const flat = asked.flat();
  assert.equal(new Set(flat).size, flat.length);
});

test("a partial list is never sent after the complete one", async () => {
  const order: string[] = [];
  await realScan(WALLET, {
    history: async (_w, onPage) => {
      onPage?.(newestFirst.slice(0, 50), 1);
      return { txs: newestFirst, pages: 2, complete: true, oldest: newestFirst.at(-1)!.timestamp };
    },
    tokens: async (mints) => new Map(mints.map((m) => [m, { symbol: "T" }])),
    onTrades: (l) => order.push(l.partial ? "partial" : "complete"),
  });
  assert.equal(order.at(-1), "complete");
  assert.equal(order.filter((o) => o === "complete").length, 1);
  assert.ok(order.indexOf("complete") === order.length - 1, "no partial after it");
});

test("with no page callback support the scan still works: only the complete list is sent", async () => {
  const events: boolean[] = [];
  await realScan(WALLET, { onTrades: (l) => events.push(l.partial) });
  assert.deepEqual(events, [false]);
});

/* ------------------------------- price calls are not wasted ------------------------------- */

test("the SOL price for every sale comes from the one series fetched for the scan, not a lookup per sale", async () => {
  let hourly = 0;
  const result = await realScan(WALLET, { prices: async (m) => priceSol(m), solUsd: async () => (hourly++, 70) });
  assert.equal(hourly, 0, "no per-sale SOL lookups when the series has the price");
  assert.ok(result.sells.some((s) => s.fumble.status === "ok"));
  const win = result.sells.find((s) => s.lot.sell.mint === WIN)!;
  assert.equal(win.fumble.status === "ok" && Math.round(win.fumble.soldUsd), Math.round(win.lot.sell.sol * 67), "valued at the series' price ($67), not the fallback's ($70)");
});

test("the per-sale lookup is still the fallback when the series cannot give a price", async () => {
  let hourly = 0;
  const result = await realScan(WALLET, {
    prices: async (m) => (m === SOL_MINT ? null : m === WIN ? { candles: winPrices.candles, source: "fake" } : null),
    solUsd: async () => (hourly++, 70),
  });
  assert.ok(hourly >= 1);
  assert.ok(result.sells.some((s) => s.fumble.status === "ok"));
});

test("reading further back never takes a cached scan and runs apart from an ordinary one", async () => {
  const runs: boolean[] = [];
  const scanner = createScanner({
    run: async (wallet, _emit, opts) => {
      runs.push(opts.more);
      return empty(wallet);
    },
    now: () => 1000,
  });
  await scanner.scan(WALLET);
  assert.equal((await scanner.scan(WALLET)).cached, true, "an ordinary rescan uses the cache");
  const more = await scanner.scan(WALLET, undefined, { more: true });
  assert.equal(more.cached, false);
  assert.deepEqual(runs, [false, true]);
});

test("a scan with its own size is passed that size, and never takes a cached scan of the default size", async () => {
  const runs: (number | undefined)[] = [];
  const scanner = createScanner({
    run: async (wallet, _emit, opts) => {
      runs.push(opts.target);
      return empty(wallet);
    },
    now: () => 1000,
  });
  await scanner.scan(WALLET);
  const sized = await scanner.scan(WALLET, undefined, { target: 250 });
  assert.equal(sized.cached, false);
  assert.deepEqual(runs, [undefined, 250]);
});
