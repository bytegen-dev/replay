import assert from "node:assert/strict";
import { test } from "node:test";
import { xlsxFileName } from "../src/lib/exportData.ts";

const rows = (...months: string[]) => months.map((month) => ({ month }));

test("the file name carries the token and the first and last month", () => {
  assert.equal(xlsxFileName({ tokenLabel: "NMKR", rows: rows("2024-12", "2025-01", "2026-10") }), "dca-nmkr-2024-12-to-2026-10.xlsx");
});

test("months are taken from the data, not its order", () => {
  assert.equal(xlsxFileName({ tokenLabel: "PEPE", rows: rows("2025-03", "2025-01", "2025-02") }), "dca-pepe-2025-01-to-2025-03.xlsx");
});

test("a single month gives a single date", () => {
  assert.equal(xlsxFileName({ tokenLabel: "NMKR", rows: rows("2025-10") }), "dca-nmkr-2025-10.xlsx");
});

test("unsafe or empty labels are flattened and never break the name", () => {
  assert.equal(xlsxFileName({ tokenLabel: "../../etc/pa ss", rows: rows("2025-01") }), "dca-etc-pa-ss-2025-01.xlsx");
  assert.equal(xlsxFileName({ tokenLabel: "$TSLAx!", rows: rows("2025-01") }), "dca-tslax-2025-01.xlsx");
  assert.equal(xlsxFileName({ tokenLabel: "", rows: rows("2025-01") }), "dca-result-2025-01.xlsx");
  assert.equal(xlsxFileName({ tokenLabel: "日本語", rows: rows("2025-01") }), "dca-result-2025-01.xlsx");
});

test("bad months are ignored; with none the date part is left off", () => {
  assert.equal(xlsxFileName({ tokenLabel: "NMKR", rows: rows("garbage", "2025-02") }), "dca-nmkr-2025-02.xlsx");
  assert.equal(xlsxFileName({ tokenLabel: "NMKR", rows: [] }), "dca-nmkr.xlsx");
});
