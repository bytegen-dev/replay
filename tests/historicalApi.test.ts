import assert from "node:assert/strict";
import { test } from "node:test";
import { renderText, runHistorical } from "../src/lib/historicalApi.ts";
import { type PriceProviders } from "../src/lib/historicalPrice.ts";
import { HttpError } from "../src/lib/http.ts";
import type { Candle } from "../src/lib/priceAt.ts";

const NOW = Date.UTC(2026, 10, 19, 15, 30, 0);
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const cd = (t: number, open: number, close: number): Candle => ({ t, open, high: Math.max(open, close), low: Math.min(open, close), close });
const SOL_ADDR = "So11111111111111111111111111111111111111112";
const EVM_ADDR = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
const POLICY = "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489";

function providers(over: Partial<PriceProviders> = {}) {
  const calls: string[] = [];
  const T = sec("2026-09-15T13:40:00Z");
  const p: PriceProviders = {
    gtPool: async (chain) => (calls.push(`pool:${chain}`), { network: "n", pool: "0xp", symbol: "TKN", name: "Token", price: 2 }),
    gtCandles: async (_pool, tf) => (calls.push(`gt:${tf}`), tf === "minute" ? [cd(T - 60, 1, 1.5)] : []),
    cgResolve: async () => ({ id: "tkn", symbol: "tkn", name: "Token", price: 2 }),
    cgSnapshots: async () => (calls.push("cg"), { candles: [{ t: T - 600, open: 1.4, high: 1.4, low: 1.4, close: 1.4 }], stepSec: 3600 }),
    cardanoUnit: async () => POLICY + "4e4d4b52",
    cardanoCandles: async (_u, period) => (calls.push(`ada:${period}`), period === "1min" ? [cd(T - 60, 0.0003, 0.00031)] : []),
    equityHistory: async () => ({ meta: { symbol: "AAPL", name: "Apple Inc.", currency: "USD", exchange: "NasdaqGS", price: 300, priceDate: "2026-11-18", splits: [] }, days: [{ date: "2026-09-15", close: 258, adjClose: 258 }], staleSince: null }),
    equityBars: async () => [],
    marketCapNow: async () => null,
    ...over,
  };
  return { p, calls };
}

test("named fields: market prefix, address, date and time", async () => {
  const { p } = providers();
  const o = await runHistorical({ market: "SOL", asset: SOL_ADDR, date: "15/09/2026", time: "13:40" }, NOW, p);
  assert.ok(o.ok);
  assert.equal(o.result.price.usd, 1.5);
  assert.equal(o.result.asset.market, "solana");
  assert.equal(o.result.when.instantUtc, "2026-09-15T13:40:00Z");
});

test("one line of text, as a chat bot sends it: address, chain, time, date", async () => {
  const { p, calls } = providers();
  const o = await runHistorical({ q: `${SOL_ADDR} SOL 13:40 15/09/2026` }, NOW, p);
  assert.ok(o.ok);
  assert.equal(o.result.price.usd, 1.5);
  assert.deepEqual(calls.slice(0, 1), ["pool:solana"]);
});

test("the chain can be left out of the line when the address only fits one", async () => {
  const { p, calls } = providers();
  const o = await runHistorical({ q: `${SOL_ADDR} 15/09/2026 13:40` }, NOW, p);
  assert.ok(o.ok);
  assert.ok(calls.includes("pool:solana"));
  const ada = await runHistorical({ q: `${POLICY} ADA 15/09/2026 13:40` }, NOW, p);
  assert.ok(ada.ok);
  assert.equal(ada.result.asset.market, "cardano");
});

test("relative dates and words work through the line too", async () => {
  const { p } = providers({ gtCandles: async (_pool, tf) => (tf === "day" ? [cd(sec("2026-11-14T00:00:00Z"), 1, 1.2)] : []) });
  const o = await runHistorical({ q: `${EVM_ADDR} ETH 5 days ago` }, NOW, p);
  assert.ok(o.ok);
  assert.equal(o.result.when.dateUtc, "2026-11-14");
  assert.equal(o.result.when.precision, "day");
  assert.equal(o.result.price.usd, 1.2);
});

test("named fields win over the same part of the line", async () => {
  const { p, calls } = providers();
  const o = await runHistorical({ q: `${EVM_ADDR} SOL 15/09/2026 13:40`, market: "BASE" }, NOW, p);
  assert.ok(o.ok);
  assert.ok(calls.includes("pool:base") && !calls.includes("pool:solana"));
});

test("stocks go by ticker", async () => {
  const { p } = providers();
  const o = await runHistorical({ q: "aapl STOCK 15/09/2026" }, NOW, p);
  assert.ok(o.ok);
  assert.equal(o.result.price.usd, 258);
  assert.equal(o.result.asset.address, "AAPL");
});

test("every problem is reported at once, by field", async () => {
  const { p } = providers();
  const o = await runHistorical({ market: "DOGE", asset: "", date: "foo bar", time: "25:99", tz: "Narnia" }, NOW, p);
  assert.ok(!o.ok);
  assert.equal(o.status, 400);
  assert.equal(o.code, "invalid_request");
  assert.deepEqual(Object.keys(o.fields ?? {}).sort(), ["asset", "date", "market", "time", "tz"], "a bad zone does not hide a bad time or a bad date");
  const d = await runHistorical({ market: "ETH", asset: EVM_ADDR, date: "foo bar" }, NOW, p);
  assert.ok(!d.ok && d.fields?.date && /Couldn't read the date "foo bar"/.test(d.fields.date));
});

test("an EVM address with no chain asks which one; a bad address for the chain is called out", async () => {
  const { p } = providers();
  const noChain = await runHistorical({ asset: EVM_ADDR, date: "15/09/2026" }, NOW, p);
  assert.ok(!noChain.ok);
  assert.match(noChain.fields?.market ?? "", /several chains.*SOL, ETH, BASE, BSC, ARB, ADA or STOCK/);
  const wrong = await runHistorical({ market: "SOL", asset: EVM_ADDR, date: "15/09/2026" }, NOW, p);
  assert.ok(!wrong.ok);
  assert.match(wrong.fields?.asset ?? "", /EVM address|Solana/);
  const short = await runHistorical({ market: "ETH", asset: "0x123", date: "15/09/2026" }, NOW, p);
  assert.ok(!short.ok && short.fields?.asset);
});

test("the future is refused, and not-found comes back with its own status and code", async () => {
  const { p } = providers({ gtPool: async () => null, cgResolve: async () => null });
  const future = await runHistorical({ market: "ETH", asset: EVM_ADDR, date: "20/11/2026" }, NOW, p);
  assert.ok(!future.ok);
  assert.match(future.fields?.date ?? "", /in the future/);
  const missing = await runHistorical({ market: "ETH", asset: EVM_ADDR, date: "15/09/2026", time: "13:40" }, NOW, p);
  assert.ok(!missing.ok);
  assert.equal(missing.status, 404);
  assert.equal(missing.code, "not_found");
});

test("once GeckoTerminal says slow down, it is not asked again for coarser candles", async () => {
  const { p, calls } = providers({
    gtCandles: async (_pool, tf) => {
      calls.push(`gt:${tf}`);
      throw new HttpError(429, "slow down");
    },
  });
  const o = await runHistorical({ market: "ETH", asset: EVM_ADDR, date: "15/09/2026", time: "13:40" }, NOW, p);
  assert.ok(o.ok, "CoinGecko answered instead");
  assert.deepEqual(calls.filter((c) => c.startsWith("gt:")), ["gt:minute"], "no hour or day request after the 429");
  assert.ok(calls.includes("cg"));
  assert.equal(o.result.source.label, "CoinGecko market data");
});

test("answers are not shared between calls when sources are replaced", async () => {
  const { p, calls } = providers();
  await runHistorical({ market: "SOL", asset: SOL_ADDR, date: "15/09/2026", time: "13:40" }, NOW, p);
  await runHistorical({ market: "SOL", asset: SOL_ADDR, date: "15/09/2026", time: "13:40" }, NOW, p);
  assert.equal(calls.filter((c) => c === "gt:minute").length, 2);
});

test("plain text for a chat: the sentence, the source, and any notes", async () => {
  const { p } = providers();
  const ok = await runHistorical({ q: `${SOL_ADDR} SOL 13:40 15/09/2026` }, NOW, p);
  const text = renderText(ok);
  assert.match(text, /^TKN was \$1\.50 at 15 Sep 2026, 13:40 UTC\./);
  assert.match(text, /\nSource: GeckoTerminal pool candles \(minute\) \(1-minute\)$/);
  const err = renderText(await runHistorical({ q: `${EVM_ADDR} 15/09/2026` }, NOW, p));
  assert.match(err, /several chains/);
  assert.ok(!err.includes("{"), "no JSON in a chat message");
  const assumed = renderText(await runHistorical({ q: `${SOL_ADDR} SOL September 15 13:40` }, NOW, p));
  assert.match(assumed, /Note: No year given, so used 2026\./);
});
