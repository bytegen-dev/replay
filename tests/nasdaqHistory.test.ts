import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNasdaqHistory } from "../src/lib/nasdaqHistory.ts";
import { runStockDca } from "../src/lib/stocks.ts";

const body = { data: { tradesTable: { rows: [{ date: "11/18/2026", close: "$1,352.45" }, { date: "10/30/2026", close: "$300.00" }, { date: "bad", close: "$1" }, { date: "09/30/2026", close: "N/A" }] } } };

test("Nasdaq history parses into oldest-first closes and skips bad rows", () => {
  const r = parseNasdaqHistory(body, "AAPL")!;
  assert.deepEqual(r.days.map((d) => [d.date, d.close]), [["2026-10-30", 300], ["2026-11-18", 1352.45]]);
  assert.equal(r.meta.price, 1352.45);
  assert.equal(r.meta.via, "nasdaq");
  assert.equal(parseNasdaqHistory({ data: null }, "X"), null);
});

test("when Yahoo refuses, the backup answers and the result says so", async () => {
  const failing = async () => {
    const e = new Error("rate limited") as Error & { status: number };
    e.status = 429;
    throw e;
  };
  const backup = async () => parseNasdaqHistory(body, "AAPL");
  const res = await runStockDca(
    { address: "AAPL", chain: "equity", amount: 100, startMonth: "2026-10", endMonth: "2026-10", basis: "month-end" } as never,
    Date.parse("2026-11-19T12:00:00Z"),
    { fetchChart: failing, fetchBackup: backup, useStore: false },
  );
  assert.equal(res.rows[0].price, 300);
  assert.equal(res.rows[0].source, "Nasdaq");
  assert.ok(res.sources[0].label.startsWith("Nasdaq"));
  assert.ok(res.warnings.some((w) => w.includes("Nasdaq")));
});
