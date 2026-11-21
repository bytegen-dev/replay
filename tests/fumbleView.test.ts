import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiSell, ApiTrade } from "../src/lib/fumble/service.ts";
import { buildRows, fumbleCell, makeEventReader, shortMint, times, usd, type StreamEvent } from "../src/lib/fumble/view.ts";

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
    [sell("o", { fumbleUsd: 3270, peakMultiple: 8.1 }), sell("t", { fumbleUsd: 0.2 }), sell("u", { status: "unknown", reason: "no price history for this token" })],
  );
  assert.deepEqual(fumbleCell(buy, false), { kind: "none" });
  assert.deepEqual(fumbleCell(waiting, false), { kind: "pricing" });
  assert.deepEqual(fumbleCell(ok, true), { kind: "fumbled", usd: 3270, peakMultiple: 8.1 });
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
