import assert from "node:assert/strict";
import { test } from "node:test";
import { SOL_DISPLAY } from "../src/lib/fumble/money.ts";
import type { ApiResult } from "../src/lib/fumble/service.ts";
import { reachDates } from "../src/lib/fumble/view.ts";
import { planRecapVideo, recapVideoFileName, sceneAt, timeline } from "../src/lib/fumble/video.ts";

const WALLET = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const NOW = 1_795_300_000;

/** A scan with two coins: A made 3 SOL over two sells (and went 4x higher after the second), B gave back 4 SOL on a position. */
function scan(over: Partial<ApiResult> = {}): ApiResult {
  const sell = (token: string, profitSol: number, fumbleSol: number, peakMultiple: number, status: "ok" | "unknown" = "ok") => ({ signature: `s-${token}-${profitSol}`, token, soldAt: 1, tokens: 1, soldSol: 1, matchedTokens: 1, costSol: 1, profitSol, profitUsd: profitSol * 100, status, fumbleSol, fumbleUsd: fumbleSol * 100, peakMultiple });
  return {
    wallet: WALLET,
    coverage: { oldest: NOW - 86400 * 10, complete: true },
    trades: [
      { signature: "b1", side: "buy", token: "A", tokens: 10, sol: 1, time: 1 },
      { signature: "b2", side: "buy", token: "B", tokens: 10, sol: 2, time: 2 },
      { signature: "s1", side: "sell", token: "A", tokens: 5, sol: 2, time: 3 },
      { signature: "s2", side: "sell", token: "A", tokens: 5, sol: 3, time: 4 },
      { signature: "s3", side: "sell", token: "B", tokens: 10, sol: 1, time: 5 },
    ],
    tokens: {},
    scannedAt: NOW,
    sells: [sell("A", 1, 1, 2), sell("A", 2, 2, 4), sell("B", -1, 0.5, 1.5)],
    positions: [{ token: "B", openedAt: 1, closedAt: 5, closedBy: "s3", costSol: 2, proceedsSol: 1, status: "ok", finalProfitSol: -1, peakProfitSol: 3, roundTripSol: 4, roundTripUsd: 400 }],
    coins: [],
    totalProfitSol: 2,
    totalProfitUsd: 200,
    totalFumbleSol: 3.5,
    totalFumbleUsd: 350,
    totalRoundTripSol: 4,
    totalRoundTripUsd: 400,
    totalMissedSol: 7,
    totalMissedUsd: 700,
    ...over,
  } as unknown as ApiResult;
}

test("the video has an intro, a scene for each figure, and an outro, in that order, with the best trade, worst roundtrip and biggest fumble", () => {
  const scenes = planRecapVideo(scan(), NOW, SOL_DISPLAY);
  assert.deepEqual(scenes.map((s) => s.id), ["intro", "pnl", "roundtrip", "fumble", "volume", "outro"]);
  assert.equal(timeline(scenes).total, 24.5);
  const [intro, pnl, roundtrip, fumble, volume] = scenes;
  assert.equal(intro.label, "Recap");
  assert.equal(intro.notes[0], "DfMx…Xhzj");
  assert.equal(intro.notes[1], "2 trades (2 buys, 3 sells)");
  // NOW is 2026-11-21 (UTC) and the history starts ten days before.
  assert.equal(intro.notes[2], "Nov 11 – Nov 21, 2026");
  assert.equal(intro.notes[3], "over 1 week 3 days");
  assert.deepEqual(scenes.filter((s) => s.figure).map((s) => s.since), ["Nov 11", "Nov 11", "Nov 11", "Nov 11"]);
  assert.deepEqual(pnl.figure?.money, { sol: 2, usd: 200, signed: true });
  assert.equal(pnl.figure?.tone, "up");
  // Coin A made 3 SOL over its two sells, more than anything else, so it is the best trade.
  assert.equal(pnl.highlight?.title, "Best trade");
  assert.equal(pnl.highlight?.ticker, "A");
  assert.equal(pnl.highlight?.detail, "+3.00 SOL");
  assert.equal(roundtrip.highlight?.detail, "Peaked at +3.00 SOL, ended at -1.00 SOL");
  // The biggest fumble is the sell with the most missed afterwards (2 SOL, 4x higher).
  assert.equal(fumble.highlight?.detail, "Sold, then 4.0x higher");
  // Every trade counts, buys and sells: 1 + 2 + 2 + 3 + 1. No coin has a dollar total here, so there is no dollar figure rather than a false $0.
  assert.deepEqual(volume.figure?.money, { sol: 9, usd: null, signed: false });
});

test("a hidden figure's scene is left out, a masked one counts up to nothing and says ***, and so does its highlight", () => {
  const scenes = planRecapVideo(scan(), NOW, SOL_DISPLAY, { pnl: "hide", roundtrip: "mask", fumble: "show", volume: "hide", wallet: true });
  assert.deepEqual(scenes.map((s) => s.id), ["intro", "roundtrip", "fumble", "outro"]);
  assert.equal(scenes[0].notes[0], "***");
  const rt = scenes[1];
  assert.equal(rt.figure?.money, null);
  assert.equal(rt.figure?.text, "***");
  assert.equal(rt.highlight?.detail, "***");
  assert.equal(rt.highlight?.ticker, "B");
  // Everything hidden leaves the intro and the outro.
  assert.deepEqual(planRecapVideo(scan(), NOW, SOL_DISPLAY, { pnl: "hide", roundtrip: "hide", fumble: "hide", volume: "hide" }).map((s) => s.id), ["intro", "outro"]);
});

test("a figure that could not be priced says so instead of counting up to a false zero, and a partial one says how much it covers", () => {
  const unpriced = scan({ sells: [{ signature: "x", token: "A", soldAt: 1, tokens: 1, soldSol: 1, matchedTokens: 1, costSol: 1, profitSol: 1, status: "unknown" }] as never, positions: [] as never });
  const f = planRecapVideo(unpriced, NOW, SOL_DISPLAY).find((s) => s.id === "fumble")!;
  assert.equal(f.figure?.money, null);
  assert.equal(f.figure?.text, "Not priced");
  assert.equal(f.highlight, undefined);
  const base = scan();
  const partial = scan({ sells: [...base.sells, { ...base.sells[0], signature: "p", status: "unknown" }] as never });
  const pf = planRecapVideo(partial, NOW, SOL_DISPLAY).find((s) => s.id === "fumble")!;
  assert.notEqual(pf.figure?.money, null);
  assert.deepEqual(pf.notes, ["3 of 4 sells priced"]);
});

test("the timeline finds the scene at a moment, stays on the last one past the end, and measures how far into it", () => {
  const scenes = planRecapVideo(scan(), NOW, SOL_DISPLAY);
  assert.deepEqual([sceneAt(scenes, 0).scene.id, sceneAt(scenes, 0).local], ["intro", 0]);
  assert.equal(sceneAt(scenes, 2.99).scene.id, "intro");
  const pnl = sceneAt(scenes, 3.5);
  assert.deepEqual([pnl.scene.id, pnl.index, pnl.local], ["pnl", 1, 0.5]);
  assert.equal(sceneAt(scenes, 9999).scene.id, "outro");
});

test("the video is named for the wallet's ends and the day, private when anything is masked or hidden", () => {
  const r = { wallet: WALLET, scannedAt: NOW };
  assert.equal(recapVideoFileName(r, {}, "mp4"), "replay-recap-dfmx-xhzj-2026-11-21.mp4");
  assert.equal(recapVideoFileName(r, { pnl: "mask" }, "webm"), "replay-recap-dfmx-xhzj-2026-11-21-private.webm");
  assert.equal(recapVideoFileName(r, { wallet: true }, "mp4"), "replay-recap-2026-11-21-private.mp4");
  assert.equal(recapVideoFileName(r, { pnl: "show", volume: "show" }, "mp4"), "replay-recap-dfmx-xhzj-2026-11-21.mp4");
});

test("each highlight names its coin's ticker and picture, and a coin with no picture has none (the video then draws its first letter)", () => {
  const scenes = planRecapVideo(scan({ tokens: { A: { symbol: "AAA", image: "https://cdn.helius-rpc.com/cdn-cgi/image/a" }, B: { symbol: "BBB" } } as never }), NOW, SOL_DISPLAY);
  const by = Object.fromEntries(scenes.map((s) => [s.id, s.highlight]));
  assert.deepEqual([by.pnl?.ticker, by.pnl?.image], ["AAA", "https://cdn.helius-rpc.com/cdn-cgi/image/a"]);
  assert.deepEqual([by.fumble?.ticker, by.fumble?.image], ["AAA", "https://cdn.helius-rpc.com/cdn-cgi/image/a"]);
  assert.deepEqual([by.roundtrip?.ticker, by.roundtrip?.image], ["BBB", undefined]);
});

test("reachDates gives the span as dates in UTC, adding the year to the start only when it is an earlier year", () => {
  const t = (iso: string) => Date.parse(iso) / 1000;
  assert.deepEqual(reachDates(t("2026-03-04T10:00:00Z"), t("2026-11-24T10:00:00Z")), { range: "Mar 4 – Nov 24, 2026", rangeFull: "Mar 4, 2026 – Nov 24, 2026", since: "Mar 4" });
  assert.deepEqual(reachDates(t("2025-12-30T10:00:00Z"), t("2026-01-02T10:00:00Z")), { range: "Dec 30, 2025 – Jan 2, 2026", rangeFull: "Dec 30, 2025 – Jan 2, 2026", since: "Dec 30, 2025" });
  assert.deepEqual(reachDates(t("2026-11-24T01:00:00Z"), t("2026-11-24T10:00:00Z")), { range: "Nov 24, 2026", rangeFull: "Nov 24, 2026", since: "Nov 24" });
});
