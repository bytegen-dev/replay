import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { withoutCoins } from "../src/lib/fumble/hide.ts";
import { scanWallet } from "../src/lib/fumble/scan.ts";
import { toApiResult } from "../src/lib/fumble/service.ts";
import type { HeliusTx } from "../src/lib/fumble/trades.ts";
import type { Candle } from "../src/lib/fumble/types.ts";

const WALLET = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const WIN = "9msk9ehERMECbvsp3mvNabSXy2k7GNcrxJgdWfh7pump";
const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/fumble/${name}`, import.meta.url), "utf8"));
const txs = read("euris-txs.json") as HeliusTx[];
const winPrices = read("win-candles-hourly.json") as { solUsdAtSale: number; candles: Candle[] };

const scan = async () =>
  toApiResult(
    await scanWallet(WALLET, {
      history: async () => ({ txs, pages: 1, complete: true, oldest: txs[txs.length - 1].timestamp }),
      prices: async (m) => (m === WIN ? { candles: winPrices.candles, source: "fake" } : null),
      solUsd: async () => winPrices.solUsdAtSale,
      now: () => 1_795_300_000,
    }),
    1_795_300_000,
  );

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} !== ${b}`);

test("with nothing hidden the scan is returned as it is", async () => {
  const r = await scan();
  assert.equal(withoutCoins(r, new Set()), r);
});

test("hiding every coin leaves nothing in the totals", async () => {
  const r = await scan();
  const all = new Set(r.trades.map((t) => t.token));
  const none = withoutCoins(r, all);
  assert.equal(none.trades.length, 0);
  for (const k of ["totalFumbleSol", "totalFumbleUsd", "totalProfitSol", "totalProfitUsd", "totalRoundTripSol", "totalMissedSol", "totalMissedUsd"] as const) assert.equal(none[k], 0);
});

test("hiding a coin takes exactly its share out of every total, and its sells are gone from the list", async () => {
  const r = await scan();
  const hide = new Set([WIN]);
  const rest = withoutCoins(r, hide);
  const own = r.sells.filter((s) => s.token === WIN);
  near(rest.totalFumbleUsd, r.totalFumbleUsd - own.reduce((a, s) => a + (s.fumbleUsd ?? 0), 0));
  near(rest.totalProfitSol, r.totalProfitSol - own.reduce((a, s) => a + s.profitSol, 0));
  near(rest.totalMissedSol, r.totalMissedSol - (r.coins.find((c) => c.token === WIN)?.missedSol ?? 0));
  assert.ok(rest.trades.every((t) => t.token !== WIN));
  assert.ok(rest.sells.every((s) => s.token !== WIN));
});
