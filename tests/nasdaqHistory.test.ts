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

test("Tiingo rows are rebuilt into split-adjusted closes and keep the dividend-adjusted close", async () => {
  const { parseTiingo, isTiingoKey } = await import("../src/lib/tiingo.ts");
  const rows = [
    { date: "2020-08-28T00:00:00.000Z", close: 500, adjClose: 120, splitFactor: 1 },
    { date: "2020-08-31T00:00:00.000Z", close: 130, adjClose: 130, splitFactor: 4 },
    { date: "2020-09-01T00:00:00.000Z", close: 134, adjClose: 134, splitFactor: 1 },
  ];
  const r = parseTiingo(rows, "AAPL")!;
  assert.deepEqual(r.days.map((d) => [d.date, d.close]), [["2020-08-28", 125], ["2020-08-31", 130], ["2020-09-01", 134]]);
  assert.equal(r.days[0].adjClose, 30);
  assert.deepEqual(r.meta.splits, [{ date: "2020-08-31", ratio: 4 }]);
  assert.equal(r.meta.via, "tiingo");
  assert.equal(parseTiingo([], "X"), null);
  assert.ok(isTiingoKey("a".repeat(40)));
  assert.ok(!isTiingoKey("short key!"));
});
