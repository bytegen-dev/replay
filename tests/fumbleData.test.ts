import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fetchHistory, isWalletAddress } from "../src/lib/fumble/helius.ts";
import { fetchRetry, makeLimiter, NetError, type Fetch } from "../src/lib/fumble/net.ts";
import { birdeyeProvider, birdeyeStep, firstOf, geckoProvider, gtStep, parseBirdeye, parseGtCandles, pickPool, solPriceAt, SOL_MINT, type PriceSeries } from "../src/lib/fumble/prices.ts";
import { scanWallet, type ScanProgress } from "../src/lib/fumble/scan.ts";
import type { HeliusTx } from "../src/lib/fumble/trades.ts";
import type { Candle } from "../src/lib/fumble/types.ts";

const WALLET = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const WIN = "9msk9ehERMECbvsp3mvNabSXy2k7GNcrxJgdWfh7pump";
const KEY = "SECRET-KEY-123";
const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/fumble/${name}`, import.meta.url), "utf8"));

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

/** A clock that only moves when something sleeps. */
function fakeClock() {
  const c = { t: 0, waits: [] as number[], now: () => c.t, sleep: async (ms: number) => void (c.waits.push(ms), (c.t += ms)) };
  return c;
}

/* ------------------------------ limiter and retry ------------------------------ */

test("the limiter starts jobs one at a time, at least the gap apart, in the order they were asked for", async () => {
  const clock = fakeClock();
  const limited = makeLimiter(1000, clock.sleep, clock.now);
  const starts: { job: number; at: number }[] = [];
  await Promise.all([1, 2, 3].map((job) => limited(async () => void starts.push({ job, at: clock.t }))));
  assert.deepEqual(starts, [{ job: 1, at: 0 }, { job: 2, at: 1000 }, { job: 3, at: 2000 }]);
});

test("a job that fails does not stop the jobs behind it", async () => {
  const clock = fakeClock();
  const limited = makeLimiter(10, clock.sleep, clock.now);
  const failing = limited(async () => {
    throw new Error("boom");
  });
  const after = limited(async () => "ok");
  await assert.rejects(failing, /boom/);
  assert.equal(await after, "ok");
});

test("a 429 is retried after a wait, and Retry-After is honoured", async () => {
  const clock = fakeClock();
  const answers = [reply(429), reply(429, {}, { "retry-after": "4" }), reply(200, { ok: true })];
  const fetchImpl: Fetch = async () => answers.shift()!;
  const res = await fetchRetry(fetchImpl, "https://example.com/x", undefined, { sleep: clock.sleep, baseMs: 1000 });
  assert.equal(res.status, 200);
  assert.deepEqual(clock.waits, [1000, 4000]);
});

test("a dropped connection is retried like a busy server", async () => {
  const clock = fakeClock();
  let calls = 0;
  const fetchImpl: Fetch = async () => {
    if (++calls < 3) throw new TypeError("network down");
    return reply(200);
  };
  assert.equal((await fetchRetry(fetchImpl, "https://example.com/x", undefined, { sleep: clock.sleep })).status, 200);
  assert.equal(calls, 3);
});

test("when the retries run out the error names the host and never the URL, so a key in the URL cannot leak", async () => {
  const clock = fakeClock();
  const fetchImpl: Fetch = async () => reply(429);
  await assert.rejects(
    fetchRetry(fetchImpl, `https://api.example.com/v0?api-key=${KEY}`, undefined, { sleep: clock.sleep, tries: 3 }),
    (e: unknown) => e instanceof NetError && e.status === 429 && e.message.includes("api.example.com") && !e.message.includes(KEY),
  );
});

test("other statuses come straight back, not retried", async () => {
  const clock = fakeClock();
  let calls = 0;
  const fetchImpl: Fetch = async () => (calls++, reply(404));
  assert.equal((await fetchRetry(fetchImpl, "https://example.com/x", undefined, { sleep: clock.sleep })).status, 404);
  assert.equal(calls, 1);
});

/* ----------------------------------- history ----------------------------------- */

const tx = (i: number): HeliusTx => ({ signature: `sig${i}`, timestamp: 10_000 - i, feePayer: WALLET, fee: 5000 });
const page = (from: number, n: number) => Array.from({ length: n }, (_, k) => tx(from + k));

test("history is read page by page, each page continuing from the last signature, until a short page ends it", async () => {
  const urls: string[] = [];
  const pages = [page(0, 100), page(100, 100), page(200, 37)];
  const fetchImpl: Fetch = async (u) => (urls.push(u), reply(200, pages.shift()));
  const h = await fetchHistory(WALLET, { apiKey: KEY, fetchImpl, sleep: async () => {} });
  assert.equal(h.txs.length, 237);
  assert.equal(h.pages, 3);
  assert.equal(h.complete, true);
  assert.equal(h.oldest, 10_000 - 236);
  assert.ok(!urls[0].includes("before="));
  assert.ok(urls[1].includes("before=sig99"));
  assert.ok(urls[2].includes("before=sig199"));
  assert.ok(urls[0].includes(`api-key=${KEY}`) && urls[0].includes("limit=100") && !urls[0].includes("type="), "everything is asked for, not just swaps");
});

test("the page cap stops a long history and says it was cut short", async () => {
  const fetchImpl: Fetch = async () => reply(200, page(0, 100));
  const h = await fetchHistory(WALLET, { apiKey: KEY, fetchImpl, sleep: async () => {}, maxPages: 2 });
  assert.equal(h.pages, 2);
  assert.equal(h.complete, false);
});

test("reading stops once a page reaches back far enough", async () => {
  const pages = [page(0, 100), page(100, 100), page(200, 100)];
  const fetchImpl: Fetch = async () => reply(200, pages.shift());
  const h = await fetchHistory(WALLET, { apiKey: KEY, fetchImpl, sleep: async () => {}, sinceTime: 10_000 - 150 });
  assert.equal(h.pages, 2);
  assert.equal(h.complete, true);
});

test("history rejects an address that is not a wallet, an error answer, and a reply that is not a list", async () => {
  assert.equal(isWalletAddress(WALLET), true);
  assert.equal(isWalletAddress("not a wallet"), false);
  assert.equal(isWalletAddress("../../etc"), false);
  await assert.rejects(fetchHistory("nope", { apiKey: KEY }), /not a Solana wallet/);
  const noSleep = async () => {};
  await assert.rejects(fetchHistory(WALLET, { apiKey: KEY, sleep: noSleep, fetchImpl: async () => reply(401) }), (e: unknown) => e instanceof NetError && !(e as Error).message.includes(KEY));
  await assert.rejects(fetchHistory(WALLET, { apiKey: KEY, sleep: noSleep, fetchImpl: async () => reply(200, { error: "bad key" }) }), /other than a list/);
});

/* ------------------------------------ prices ------------------------------------ */

test("the candle size is the finest one that covers the stretch in a single call", () => {
  assert.equal(birdeyeStep(6 * 3600).type, "1m"); // 360 candles
  assert.equal(birdeyeStep(20 * 3600).type, "5m");
  assert.equal(birdeyeStep(12 * 86400).type, "1H"); // 15-minute candles would be 1152
  assert.equal(birdeyeStep(100 * 86400).type, "4H");
  assert.equal(birdeyeStep(3000 * 86400).type, "1D"); // beyond what one call can hold: the daily candle, the best there is
  assert.equal(gtStep(30 * 3600).aggregate, 5);
  assert.equal(gtStep(30 * 3600).path, "minute");
  assert.equal(gtStep(30 * 86400).path, "hour");
});

test("Birdeye candles are read from the real response shape, sorted, with bad rows dropped", () => {
  const body = {
    success: true,
    data: {
      items: [
        { address: WIN, unixTime: 7200, o: 2, h: 3, l: 1, c: 2.5, v: 10, type: "1H", vUsd: 99, currency: "usd" },
        { address: WIN, unixTime: 3600, o: 1, h: 2, l: 0.5, c: 1.5, v: 10, type: "1H", vUsd: 50, currency: "usd" },
        { address: WIN, unixTime: 10800, o: 0, h: 0, l: 0, c: 0, v: 0, type: "1H", vUsd: 0, currency: "usd" },
      ],
      isScaledUiToken: false,
      multiplier: null,
    },
  };
  const c = parseBirdeye(body)!;
  assert.deepEqual(c.map((x) => x.t), [3600, 7200]);
  assert.deepEqual(c[1], { t: 7200, h: 3, l: 1, c: 2.5, v: 99 });
  assert.equal(parseBirdeye({ success: false }), null);
  assert.equal(parseBirdeye(null), null);
});

test("the Birdeye provider sends the key in a header (not the URL) and asks for the right stretch", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: Fetch = async (url, init) => (seen.push({ url, init }), reply(200, { success: true, data: { items: [{ unixTime: 5000, h: 2, l: 1, c: 1.5, vUsd: 10 }] } }));
  const clock = fakeClock();
  const get = birdeyeProvider(KEY, { fetchImpl, sleep: clock.sleep, now: clock.now });
  const candles = await get(WIN, 1_000_000, 1_000_000 + 6 * 3600);
  assert.equal(candles?.length, 1);
  const { url, init } = seen[0];
  assert.ok(url.includes(`address=${WIN}`) && url.includes("type=1m") && url.includes("time_from=999940") && url.includes(`time_to=${1_000_000 + 6 * 3600}`), url);
  assert.ok(!url.includes(KEY), "the key is not in the URL");
  assert.equal((init?.headers as Record<string, string>)["X-API-KEY"], KEY);
  assert.equal((init?.headers as Record<string, string>)["x-chain"], "solana");
});

test("Birdeye: a token it does not know is null, and a refusal is an error the caller can fall back from", async () => {
  const clock = fakeClock();
  const none = birdeyeProvider(KEY, { fetchImpl: async () => reply(404), sleep: clock.sleep, now: clock.now });
  assert.equal(await none(WIN, 0, 3600), null);
  const denied = birdeyeProvider(KEY, { fetchImpl: async () => reply(401), sleep: clock.sleep, now: clock.now });
  await assert.rejects(denied(WIN, 0, 3600), (e: unknown) => e instanceof NetError && e.status === 401);
});

test("the busiest pool is picked, and the price call is told whether the token is the pool's base or quote", () => {
  const pools = {
    data: [
      { attributes: { address: "quiet", volume_usd: { h24: "10" } }, relationships: { base_token: { data: { id: `solana_${WIN}` } } } },
      { attributes: { address: "busy", volume_usd: { h24: "5000" } }, relationships: { base_token: { data: { id: "solana_OTHER" } } } },
    ],
  };
  assert.deepEqual(pickPool(pools, WIN), { address: "busy", side: "quote" });
  assert.deepEqual(pickPool({ data: [pools.data[0]] }, WIN), { address: "quiet", side: "base" });
  assert.equal(pickPool({ data: [] }, WIN), null);
  assert.equal(pickPool(null, WIN), null);
});

test("GeckoTerminal candles are read from [time, open, high, low, close, volume] rows, sorted", () => {
  const c = parseGtCandles({ data: { attributes: { ohlcv_list: [[200, 1, 4, 1, 3, 70], [100, 1, 2, 1, 2, 30], [300, 0, 0, 0, 0, 0]] } } })!;
  assert.deepEqual(c, [{ t: 100, h: 2, l: 1, c: 2, v: 30 }, { t: 200, h: 4, l: 1, c: 3, v: 70 }]);
});

test("the GeckoTerminal provider finds the pool first, then fetches candles for the token's side of it", async () => {
  const urls: string[] = [];
  const fetchImpl: Fetch = async (url) => {
    urls.push(url);
    if (url.includes("/tokens/")) return reply(200, { data: [{ attributes: { address: "POOL1", volume_usd: { h24: "9" } }, relationships: { base_token: { data: { id: "solana_OTHER" } } } }] });
    return reply(200, { data: { attributes: { ohlcv_list: [[100, 1, 2, 1, 2, 5]] } } });
  };
  const clock = fakeClock();
  const get = geckoProvider({ fetchImpl, sleep: clock.sleep, now: clock.now });
  const candles = await get(WIN, 0, 3 * 3600);
  assert.equal(candles?.length, 1);
  assert.ok(urls[1].includes("/pools/POOL1/ohlcv/minute") && urls[1].includes("token=quote") && urls[1].includes("currency=usd"), urls[1]);
  assert.ok(clock.waits.some((w) => w >= 2000), "the two calls were spaced out for the free tier");
});

test("providers are tried in order: one that fails or has nothing is skipped, and none having it gives null", async () => {
  const series: Candle[] = [{ t: 1, h: 2, l: 1, c: 2 }];
  const throws = { name: "a", get: async () => Promise.reject(new Error("down")) };
  const empty = { name: "b", get: async () => null };
  const good = { name: "c", get: async () => series };
  assert.deepEqual(await firstOf([throws, empty, good])(WIN, 0, 1), { candles: series, source: "c" });
  assert.equal(await firstOf([throws, empty])(WIN, 0, 1), null);
  assert.equal((await firstOf([good, throws])(WIN, 0, 1))?.source, "c", "the first one that answers wins");
});

test("the SOL price is fetched once per hour, however many sales fall in it", async () => {
  const calls: [string, number, number][] = [];
  const prices = async (mint: string, from: number, now: number): Promise<PriceSeries | null> => {
    calls.push([mint, from, now]);
    return { candles: [{ t: from, h: 71, l: 69, c: 70 }, { t: from + 60, h: 73, l: 70, c: 72 }], source: "x" };
  };
  const sol = solPriceAt(prices);
  assert.equal(await sol(3600 + 10), 70);
  assert.equal(await sol(3600 + 90), 72);
  assert.equal(await sol(3600 + 3000), 72);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [SOL_MINT, 3600, 7200]);
  await sol(7200 + 5);
  assert.equal(calls.length, 2);
  assert.equal(await solPriceAt(async () => null)(5), null);
});

/* ------------------------------------ the scan ------------------------------------ */

const txs = read("euris-txs.json") as HeliusTx[];
const winPrices = read("win-candles-hourly.json") as { solUsdAtSale: number; candles: Candle[] };
const history = async () => ({ txs, pages: 1, complete: true, oldest: txs[txs.length - 1].timestamp });

test("a whole wallet: its sells are found, the ones with prices get a fumble, the others are reported unknown, not zero", async () => {
  const progress: ScanProgress[] = [];
  const priced: string[] = [];
  const result = await scanWallet(WALLET, {
    history,
    prices: async (mint) => (priced.push(mint), mint === WIN ? { candles: winPrices.candles, source: "fake" } : null),
    solUsd: async () => winPrices.solUsdAtSale,
    now: () => 1_795_300_000,
    onProgress: (p) => progress.push(p),
  });

  assert.equal(result.trades, 28);
  assert.equal(result.sells.length, 3);
  assert.deepEqual(result.sells.map((s) => s.fumble.status), ["no-price", "no-price", "ok"]); // oldest first
  assert.equal(result.unpriced, 2);
  assert.equal(new Set(priced).size, 3, "one price lookup per token");
  assert.equal(priced.length, 3);
  assert.ok(result.totalFumbleUsd > 3250 && result.totalFumbleUsd < 3450, `total ${result.totalFumbleUsd}`);
  assert.equal(result.worst?.lot.sell.mint, WIN);
  assert.equal(result.worst?.source, "fake");
  assert.deepEqual(result.history, { transactions: 100, pages: 1, complete: true, oldest: txs[txs.length - 1].timestamp });
  assert.equal(progress[0].stage, "history");
  assert.equal(progress.at(-1)?.stage, "done");
  assert.ok(progress.some((p) => p.stage === "prices" && p.total === 3));
});

test("a sale that cannot be valued because there is no SOL price is unknown, and the token is still looked up only once", async () => {
  let lookups = 0;
  const result = await scanWallet(WALLET, {
    history,
    prices: async () => (lookups++, { candles: winPrices.candles, source: "fake" }),
    solUsd: async () => null,
    now: () => 1_795_300_000,
  });
  assert.equal(lookups, 3);
  assert.equal(result.totalFumbleUsd, 0);
  assert.equal(result.unpriced, 3);
  assert.equal(result.worst, null);
  assert.ok(result.sells.every((s) => s.fumble.status === "no-price"));
});

test("a scan carries the history's own limits through, so a page can say it only saw part of a wallet", async () => {
  const result = await scanWallet(WALLET, {
    history: async () => ({ txs: [], pages: 5, complete: false, oldest: 123 }),
    prices: async () => null,
    solUsd: async () => 70,
  });
  assert.equal(result.history.complete, false);
  assert.equal(result.history.pages, 5);
  assert.equal(result.sells.length, 0);
  assert.equal(result.totalFumbleUsd, 0);
});
