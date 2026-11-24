import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { buildFumbleWorkbook, fumbleFileName, parseFumbleExport } from "../src/lib/fumble/export.ts";
import { scanWallet } from "../src/lib/fumble/scan.ts";
import { toApiResult } from "../src/lib/fumble/service.ts";
import { veryActive } from "../src/lib/fumble/view.ts";
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
      tokens: async (mints) => new Map(mints.map((m) => [m, { symbol: m === WIN ? "WIN" : undefined, name: m === WIN ? "Win Coin" : undefined }])),
      now: () => 1_795_300_000,
    }),
    1_795_300_000,
  );

const open = async (r: Awaited<ReturnType<typeof scan>>) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildFumbleWorkbook(r)) as unknown as ArrayBuffer);
  return wb;
};

test("the spreadsheet has a summary, every trade, and the closed positions", async () => {
  const r = await scan();
  const wb = await open(r);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Summary", "Trades", "Transactions", "Positions"]);
  assert.equal(wb.getWorksheet("Transactions")!.rowCount, r.trades.length + 1);
  assert.equal(wb.getWorksheet("Positions")!.rowCount, r.positions.length + 1);
});

test("the summary totals are formulas over the trades and positions, with the scan's numbers as their results", async () => {
  const r = await scan();
  const sum = (await open(r)).getWorksheet("Summary")!;
  const find = (label: string) => {
    for (let i = 1; i <= sum.rowCount; i++) if (sum.getCell(`A${i}`).value === label) return sum.getCell(`B${i}`).value as ExcelJS.CellFormulaValue;
    throw new Error(`no row ${label}`);
  };
  assert.match(find("Fumbled (USD)").formula, /SUM\(Transactions!I2:I\d+\)/);
  assert.ok(Math.abs((find("Fumbled (USD)").result as number) - r.totalFumbleUsd) < 1e-6);
  assert.ok(Math.abs((find("Profit (SOL)").result as number) - r.totalProfitSol) < 1e-9);
  assert.match(find("Roundtripped (SOL)").formula, /SUM\(Positions!I2:I\d+\)/);
});

test("a measured sell shows its fumble and the coin's ticker, and a sell with no price says why", async () => {
  const r = await scan();
  const tr = (await open(r)).getWorksheet("Transactions")!;
  const rows = Array.from({ length: tr.rowCount - 1 }, (_, i) => tr.getRow(i + 2));
  const fumbled = rows.filter((x) => typeof x.getCell("I").value === "number" && (x.getCell("I").value as number) > 1000);
  assert.equal(fumbled.length, 1);
  assert.equal(fumbled[0].getCell("C").value, "WIN");
  assert.equal(fumbled[0].getCell("D").value, "Win Coin");
  assert.equal(fumbled[0].getCell("P").value, WIN);
  const unknown = rows.filter((x) => String(x.getCell("O").value).includes("Fumble unknown"));
  assert.equal(unknown.length, r.unknown);
});

test("transactions link to the explorer and dates are real dates", async () => {
  const tr = (await open(await scan())).getWorksheet("Transactions")!;
  const link = tr.getCell("Q2").value as ExcelJS.CellHyperlinkValue;
  assert.match(link.hyperlink, /^https:\/\/solscan\.io\/tx\//);
  assert.ok(tr.getCell("A2").value instanceof Date);
});

test("the file is named for the wallet's ends and the day of the scan", () => {
  assert.equal(fumbleFileName({ wallet: WALLET, scannedAt: 1_795_300_000 }), "replay-fumble-dfmx-xhzj-2026-11-21.xlsx");
});

/* ------------------------------------- reading the request ------------------------------------- */

test("a request that is not a wallet's scan is refused", () => {
  assert.equal(typeof parseFumbleExport(null), "string");
  assert.equal(typeof parseFumbleExport({ wallet: "nope", trades: [] }), "string");
  assert.equal(typeof parseFumbleExport({ wallet: WALLET, trades: [] }), "string");
});

test("a scan result passes through the checks unchanged where it matters", async () => {
  const r = await scan();
  const parsed = parseFumbleExport(JSON.parse(JSON.stringify(r)));
  assert.notEqual(typeof parsed, "string");
  const p = parsed as Awaited<ReturnType<typeof scan>>;
  assert.equal(p.trades.length, r.trades.length);
  assert.equal(p.sells.length, r.sells.length);
  assert.equal(p.totalFumbleUsd, r.totalFumbleUsd);
});

test("rows with missing numbers are dropped, and markup in a name stays plain text", () => {
  const parsed = parseFumbleExport({
    wallet: WALLET,
    trades: [{ side: "buy", token: WIN, tokens: 1, sol: 1, time: 5, signature: "a" }, { side: "sell", token: WIN, tokens: "x", sol: 1, time: 5 }, { side: "hold" }],
    tokens: { [WIN]: { symbol: "<b>X</b>", name: "n" } },
  });
  assert.notEqual(typeof parsed, "string");
  assert.equal((parsed as { trades: unknown[] }).trades.length, 1);
});

/* --------------------------------------- very active wallets --------------------------------------- */

const NOW = 1_795_300_000;
test("a wallet doing hundreds of transactions a day is very active", () => {
  assert.equal(veryActive({ transactions: 900, oldest: NOW - 23 * 3600 }, NOW), true);
  assert.equal(veryActive({ transactions: 3000, oldest: NOW - 2 * 86400 }, NOW), true);
});

test("an ordinary wallet, or too little read to tell, is not", () => {
  assert.equal(veryActive({ transactions: 600, oldest: NOW - 20 * 86400 }, NOW), false);
  assert.equal(veryActive({ transactions: 250, oldest: NOW - 3600 }, NOW), false);
  assert.equal(veryActive({ transactions: 900, oldest: null }, NOW), false);
});

test("a short burst does not read as an endless rate", () => {
  // 400 transactions in the last minute counts as an hour's worth: still very active, but the rate is bounded.
  assert.equal(veryActive({ transactions: 400, oldest: NOW - 60 }, NOW), true);
  assert.equal(veryActive({ transactions: 300, oldest: NOW - 5 * 86400 }, NOW), false);
});

test("the Trades sheet has one row per coin with the page's columns and no actions column", async () => {
  const r = await scan();
  const ws = (await open(r)).getWorksheet("Trades")!;
  const head = (ws.getRow(1).values as string[]).slice(1);
  assert.deepEqual(head.slice(0, 5), ["Coin", "Name", "Position opened (UTC)", "Last trade (UTC)", "Bought (SOL)"]);
  assert.ok(!head.some((h) => /action/i.test(h)));
  assert.equal(ws.rowCount, new Set(r.trades.map((t) => t.token)).size + 1);
  // The averages are formulas over the money and token columns.
  const row = ws.getRow(2);
  if (typeof row.getCell("G").value === "number" && (row.getCell("G").value as number) > 0) assert.match(String((row.getCell("K").value as { formula: string }).formula), /^E2\/G2$/);
});
