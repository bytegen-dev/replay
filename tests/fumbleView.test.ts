import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiPosition, ApiSell, ApiTrade } from "../src/lib/fumble/service.ts";
import { buildRows, fumbleCell, makeEventReader, pnlCell, roundTripCell, shortMint, signedSol, signedUsd, sol, times, tokenLabel, usd, type StreamEvent } from "../src/lib/fumble/view.ts";

const trade = (signature: string, side: "buy" | "sell", time = 1): ApiTrade => ({ signature, side, token: "M".repeat(44), tokens: 100, sol: 1, time });
const sell = (signature: string, extra: Partial<ApiSell> = {}): ApiSell => ({ signature, token: "M".repeat(44), soldAt: 1, tokens: 100, soldSol: 1, matchedTokens: 100, costSol: 1, profitSol: 0, status: "ok", fumbleUsd: 50, peakMultiple: 3, ...extra });

test("events are read from chunks that end anywhere, even in the middle of a line", () => {
  const got: StreamEvent[] = [];
  const r = makeEventReader((e) => got.push(e));
  const text = `{"type":"progress","stage":"history","done":0,"total":0}\n{"type":"error","message":"héllo"}\n`;
  for (const ch of text) r.push(ch); // one character at a time
  assert.deepEqual(got.map((e) => e.type), ["progress", "error"]);
  assert.equal(got[1].type === "error" && got[1].message, "héllo");
});

test("a last line with no newline is read when the stream ends, and not before", () => {
  const got: StreamEvent[] = [];
  const r = makeEventReader((e) => got.push(e));
  r.push('{"type":"error","message":"x"}');
  assert.equal(got.length, 0);
  r.end();
  assert.equal(got.length, 1);
});

test("a garbled line, a blank line and something that is not an event are skipped without ending the stream", () => {
  const got: StreamEvent[] = [];
  const r = makeEventReader((e) => got.push(e));
  r.push('not json\n\n{"no":"type"}\n[1,2]\n{"type":"error","message":"ok"}\n');
  r.end();
  assert.equal(got.length, 1);
});

test("each trade is put next to its sell result, and buys and unpriced sells have none", () => {
  const trades = [trade("a", "sell"), trade("b", "buy"), trade("c", "sell")];
  const rows = buildRows(trades, [sell("a")]);
  assert.equal(rows[0].sell?.signature, "a");
  assert.equal(rows[1].sell, null);
  assert.equal(rows[2].sell, null);
  assert.deepEqual(buildRows(trades, null).map((r) => r.sell), [null, null, null]);
  assert.deepEqual(buildRows(trades, [sell("a")]).map((r) => r.trade.signature), ["a", "b", "c"], "the order of the trades is kept");
});

test("what the fumble column says: nothing for a buy, pricing while it waits, then the result", () => {
  const [buy, waiting, ok, tiny, unknown] = buildRows(
    [trade("b", "buy"), trade("w", "sell"), trade("o", "sell"), trade("t", "sell"), trade("u", "sell")],
    [sell("o", { fumbleUsd: 3270, fumbleSol: 49, peakMultiple: 8.1 }), sell("t", { fumbleUsd: 0.2 }), sell("u", { status: "unknown", reason: "no price history for this token" })],
  );
  assert.deepEqual(fumbleCell(buy, false), { kind: "none" });
  assert.deepEqual(fumbleCell(waiting, false), { kind: "pricing" });
  assert.deepEqual(fumbleCell(ok, true), { kind: "fumbled", usd: 3270, sol: 49, peakMultiple: 8.1 });
  assert.deepEqual(fumbleCell(tiny, true), { kind: "sold-well" });
  assert.deepEqual(fumbleCell(unknown, true), { kind: "unknown", reason: "no price history for this token" });
  assert.equal(fumbleCell(waiting, true).kind, "unknown", "a sell still unpriced once the scan is done is unknown, not pending forever");
});

test("numbers are written the way a person reads them", () => {
  assert.equal(usd(3270.4), "$3,270");
  assert.equal(usd(85.5), "$85.50");
  assert.equal(usd(0), "$0.00");
  assert.equal(times(8.11), "8.1x");
  assert.equal(times(12.4), "12x");
  assert.equal(times(1.014), "1.01x");
  assert.equal(times(1.174), "1.17x");
  assert.equal(shortMint("9msk9ehERMECbvsp3mvNabSXy2k7GNcrxJgdWfh7pump"), "9msk…pump");
  assert.equal(shortMint("short"), "short");
});

const position = (closedBy: string, extra: Partial<ApiPosition> = {}): ApiPosition => ({ token: "M".repeat(44), openedAt: 1, closedAt: 2, closedBy, costSol: 1, proceedsSol: 1.5, status: "ok", finalProfitSol: 0.5, peakProfitSol: 9, peakAt: 1, roundTripSol: 8.5, roundTripUsd: 850, gaveBack: 8.5 / 9, ...extra });

test("the position a sell closed is put on that sell's row, and only that row", () => {
  const rows = buildRows([trade("a", "sell"), trade("b", "buy"), trade("c", "sell")], [sell("a"), sell("c")], [position("c")]);
  assert.deepEqual(rows.map((r) => r.position?.closedBy ?? null), [null, null, "c"]);
  assert.deepEqual(buildRows([trade("a", "sell")], [sell("a")]).map((r) => r.position), [null], "no positions yet: nothing on any row");
});

test("what the gave-back column says: the round-trip, nothing near the peak, unknown, or nothing for rows that closed no position", () => {
  const [plain, big, small, unknown] = buildRows(
    [trade("p", "sell"), trade("b", "sell"), trade("s", "sell"), trade("u", "sell")],
    null,
    [position("b"), position("s", { roundTripSol: 0.01, gaveBack: 0.1 }), position("u", { status: "unknown", reason: "no price history for this token" })],
  );
  assert.deepEqual(roundTripCell(plain), { kind: "none" });
  assert.equal(roundTripCell(big).kind, "gave-back");
  assert.deepEqual(roundTripCell(big), { kind: "gave-back", usd: 850, sol: 8.5, share: 8.5 / 9 });
  assert.deepEqual(roundTripCell(small), { kind: "kept" });
  assert.deepEqual(roundTripCell(unknown), { kind: "unknown", reason: "no price history for this token" });
});

test("SOL amounts are written with sensible digits", () => {
  assert.equal(sol(8.5), "8.50 SOL");
  assert.equal(sol(12.46), "12.5 SOL");
  assert.equal(sol(250.4), "250 SOL");
});

test("a coin is written by its ticker, with its name beside it when the name says something more", () => {
  const mint = "9msk9ehERMECbvsp3mvNabSXy2k7GNcrxJgdWfh7pump";
  const tokens = { [mint]: { symbol: "win", name: "it only takes one win" }, same: { symbol: "iNu", name: "INU" } };
  assert.deepEqual(tokenLabel(mint, tokens), { ticker: "win", name: "it only takes one win" });
  assert.deepEqual(tokenLabel("same", tokens), { ticker: "iNu", name: null }, "a name that only repeats the ticker is dropped");
  assert.deepEqual(tokenLabel(mint, {}), { ticker: "9msk\u2026pump", name: null }, "no metadata: the address");
  assert.deepEqual(tokenLabel(mint, { [mint]: { name: "Only a name" } }), { ticker: "9msk\u2026pump", name: "Only a name" });
  assert.deepEqual(tokenLabel(mint, undefined), { ticker: "9msk\u2026pump", name: null });
});

test("what the PnL column says: nothing for a buy, pricing while it waits, unknown when no buy was seen, else the profit", () => {
  const [buy, waiting, traced, partial, untraced] = buildRows(
    [trade("b", "buy"), trade("w", "sell"), trade("t", "sell"), trade("p", "sell"), trade("u", "sell")],
    [sell("t", { profitSol: -2, profitUsd: -134, matchedTokens: 100 }), sell("p", { profitSol: 1, matchedTokens: 40 }), sell("u", { matchedTokens: 0, profitSol: 0 })],
  );
  assert.deepEqual(pnlCell(buy, false), { kind: "none" });
  assert.deepEqual(pnlCell(waiting, false), { kind: "pending" });
  assert.equal(pnlCell(waiting, true).kind, "unknown", "a sell still missing once the scan is done is unknown");
  assert.deepEqual(pnlCell(traced, true), { kind: "profit", usd: -134, sol: -2, partial: false });
  assert.deepEqual(pnlCell(partial, true), { kind: "profit", usd: null, sol: 1, partial: true }, "only 40 of 100 tokens traced to a buy; no dollar rate");
  assert.deepEqual(pnlCell(untraced, true), { kind: "unknown" });
});

test("gains and losses are written with their sign", () => {
  assert.equal(signedUsd(903.4), "+$903");
  assert.equal(signedUsd(-1385.9), "-$1,386");
  assert.equal(signedUsd(0), "$0.00");
  assert.equal(signedSol(-20.43), "-20.4 SOL");
  assert.equal(signedSol(0.5), "+0.50 SOL");
});
