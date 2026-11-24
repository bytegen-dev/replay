import ExcelJS from "exceljs";
import { coinRows } from "./coins.ts";
import { isWalletAddress } from "./helius.ts";
import type { ApiPosition, ApiResult, ApiSell, ApiTrade } from "./service.ts";
import { fumbleFileName, shortMint } from "./view.ts";

export { fumbleFileName };

/**
 * The scan as a spreadsheet: a summary, the trades by coin (as on the page), every transaction with its profit, fumble and the profit roundtripped, and the closed positions. The totals
 * on the summary are formulas over those sheets, so the numbers can be checked and followed.
 */

const MAX_ROWS = 20_000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.slice(0, MAX_ROWS).filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);

/** The scan result as the page holds it, checked and trimmed to what the spreadsheet uses. A string is the reason it was refused. */
export function parseFumbleExport(x: unknown): ApiResult | string {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return "Body must be an object";
  const wallet = str(r.wallet, 60);
  if (!isWalletAddress(wallet)) return "That doesn't look like a Solana wallet address.";
  const trades: ApiTrade[] = arr(r.trades).flatMap((t) => {
    const time = num(t.time);
    const tokens = num(t.tokens);
    const sol = num(t.sol);
    if ((t.side !== "buy" && t.side !== "sell") || time === undefined || tokens === undefined || sol === undefined) return [];
    return [{ signature: str(t.signature, 100), side: t.side, token: str(t.token, 60), tokens, sol, time }];
  });
  if (trades.length === 0) return "There are no trades to export";
  const sells: ApiSell[] = arr(r.sells).map((s) => ({
    signature: str(s.signature, 100),
    token: str(s.token, 60),
    soldAt: num(s.soldAt) ?? 0,
    tokens: num(s.tokens) ?? 0,
    soldSol: num(s.soldSol) ?? 0,
    matchedTokens: num(s.matchedTokens) ?? 0,
    costSol: num(s.costSol) ?? 0,
    profitSol: num(s.profitSol) ?? 0,
    ...(num(s.profitUsd) !== undefined ? { profitUsd: num(s.profitUsd) } : {}),
    status: s.status === "ok" ? "ok" : "unknown",
    ...(typeof s.reason === "string" ? { reason: str(s.reason) } : {}),
    ...(num(s.peakAt) !== undefined ? { peakAt: num(s.peakAt) } : {}),
    ...(num(s.peakMultiple) !== undefined ? { peakMultiple: num(s.peakMultiple) } : {}),
    ...(num(s.fumbleUsd) !== undefined ? { fumbleUsd: num(s.fumbleUsd) } : {}),
    ...(num(s.fumbleSol) !== undefined ? { fumbleSol: num(s.fumbleSol) } : {}),
  }));
  const positions: ApiPosition[] = arr(r.positions).map((p) => ({
    token: str(p.token, 60),
    openedAt: num(p.openedAt) ?? 0,
    closedAt: num(p.closedAt) ?? 0,
    closedBy: str(p.closedBy, 100),
    costSol: num(p.costSol) ?? 0,
    proceedsSol: num(p.proceedsSol) ?? 0,
    status: p.status === "ok" ? "ok" : "unknown",
    ...(typeof p.reason === "string" ? { reason: str(p.reason) } : {}),
    ...(num(p.finalProfitSol) !== undefined ? { finalProfitSol: num(p.finalProfitSol) } : {}),
    ...(num(p.peakProfitSol) !== undefined ? { peakProfitSol: num(p.peakProfitSol) } : {}),
    ...(num(p.peakAt) !== undefined ? { peakAt: num(p.peakAt) } : {}),
    ...(num(p.roundTripSol) !== undefined ? { roundTripSol: num(p.roundTripSol) } : {}),
    ...(num(p.roundTripUsd) !== undefined ? { roundTripUsd: num(p.roundTripUsd) } : {}),
    ...(num(p.gaveBack) !== undefined ? { gaveBack: num(p.gaveBack) } : {}),
  }));
  const tokens: ApiResult["tokens"] = {};
  const raw = (r.tokens && typeof r.tokens === "object" ? r.tokens : {}) as Record<string, { symbol?: unknown; name?: unknown }>;
  for (const [mint, info] of Object.entries(raw).slice(0, MAX_ROWS)) tokens[str(mint, 60)] = { symbol: str(info?.symbol, 40) || undefined, name: str(info?.name, 80) || undefined };
  const cov = (r.coverage ?? {}) as Record<string, unknown>;
  return {
    wallet,
    scannedAt: num(r.scannedAt) ?? Math.floor(Date.now() / 1000),
    coverage: { transactions: num(cov.transactions) ?? 0, pages: num(cov.pages) ?? 0, complete: cov.complete === true, oldest: num(cov.oldest) ?? null },
    tradeCount: num(r.tradeCount) ?? trades.length,
    ignored: { noTokenMove: 0, multiToken: 0, noSolLeg: 0 },
    trades,
    tokens,
    partial: false,
    pnl: {},
    sells,
    measured: sells.filter((s) => s.status === "ok").length,
    unknown: sells.filter((s) => s.status !== "ok").length,
    totalFumbleUsd: num(r.totalFumbleUsd) ?? 0,
    totalFumbleSol: num(r.totalFumbleSol) ?? 0,
    totalProfitSol: num(r.totalProfitSol) ?? 0,
    totalProfitUsd: num(r.totalProfitUsd) ?? 0,
    partialSells: num(r.partialSells) ?? 0,
    positions,
    totalRoundTripSol: num(r.totalRoundTripSol) ?? 0,
    totalRoundTripUsd: num(r.totalRoundTripUsd) ?? 0,
    totalMissedSol: num(r.totalMissedSol) ?? 0,
    totalMissedUsd: num(r.totalMissedUsd) ?? 0,
    coins: arr(r.coins).map((c) => ({ token: str(c.token, 60), boughtUsd: num(c.boughtUsd) ?? null, soldUsd: num(c.soldUsd) ?? null, profitUsd: num(c.profitUsd) ?? null, missedSol: num(c.missedSol) ?? 0, missedUsd: num(c.missedUsd) ?? 0 })),
    ranOutOfTime: r.ranOutOfTime === true,
  };
}

const BOLD = { bold: true };
const date = (s: number) => new Date(s * 1000);
const DATE_FMT = "yyyy-mm-dd hh:mm";
const USD = "#,##0.00";
const SOL = "#,##0.000";

export async function buildFumbleWorkbook(r: ApiResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Replay";
  const sum = wb.addWorksheet("Summary");
  const co = wb.addWorksheet("Trades");
  const tr = wb.addWorksheet("Transactions");
  const po = wb.addWorksheet("Positions");

  const label = (mint: string) => r.tokens[mint]?.symbol ?? shortMint(mint);
  const sellBy = new Map(r.sells.map((s) => [s.signature, s]));
  const closing = new Map(r.positions.map((p) => [p.closedBy, p]));

  /* ---- Trades: one row per coin, the same columns as the table on the page (without its buttons) ---- */
  co.addRow(["Coin", "Name", "Position opened (UTC)", "Last trade (UTC)", "Bought (SOL)", "Bought (USD)", "Tokens bought", "Sold (SOL)", "Sold (USD)", "Tokens sold", "Avg entry (SOL)", "Avg exit (SOL)", "Avg entry (USD)", "Avg exit (USD)", "Balance (tokens)", "PnL (SOL)", "PnL (USD)", "PnL (%)", "Fumbled (SOL)", "Fumbled (USD)", "Note", "Coin address"]);
  co.getRow(1).font = BOLD;
  co.views = [{ state: "frozen", ySplit: 1 }];
  const profits = Object.fromEntries(r.sells.map((x) => [x.signature, { profitSol: x.profitSol, matchedTokens: x.matchedTokens }]));
  const coins = coinRows(r.trades, profits, r.coins);
  coins.forEach((c, i) => {
    const row = i + 2;
    const e = c.extra;
    const name = r.tokens[c.mint]?.name;
    const put = (col: string, value: ExcelJS.CellValue, fmt?: string) => {
      co.getCell(`${col}${row}`).value = value;
      if (fmt) co.getCell(`${col}${row}`).numFmt = fmt;
    };
    put("A", label(c.mint));
    put("B", name && name.toLowerCase() !== label(c.mint).toLowerCase() ? name : "");
    put("C", date(c.firstAt), DATE_FMT);
    put("D", date(c.lastAt), DATE_FMT);
    put("E", c.boughtSol, SOL);
    if (e?.boughtUsd != null) put("F", e.boughtUsd, USD);
    put("G", c.boughtTokens, "#,##0.##");
    if (c.soldTokens > 0) {
      put("H", c.soldSol, SOL);
      if (e?.soldUsd != null) put("I", e.soldUsd, USD);
      put("J", c.soldTokens, "#,##0.##");
    }
    // The averages are formulas over the money and token columns, so they can be checked.
    if (c.boughtTokens > 0) {
      put("K", { formula: `E${row}/G${row}`, result: c.avgEntrySol ?? 0 }, "0.000000000");
      if (e?.boughtUsd != null) put("M", { formula: `F${row}/G${row}`, result: e.boughtUsd / c.boughtTokens }, "0.000000000");
    }
    if (c.soldTokens > 0) {
      put("L", { formula: `H${row}/J${row}`, result: c.avgExitSol ?? 0 }, "0.000000000");
      if (e?.soldUsd != null) put("N", { formula: `I${row}/J${row}`, result: e.soldUsd / c.soldTokens }, "0.000000000");
    }
    put("O", c.balance > 0 ? c.balance : "Sold all", c.balance > 0 ? "#,##0.##" : undefined);
    if (c.profitSol !== null) {
      put("P", c.profitSol, SOL);
      if (e?.profitUsd != null) put("Q", e.profitUsd, USD);
      if (c.profitPct !== null) put("R", c.profitPct, "0.0%");
    }
    if (c.soldTokens > 0 && e) {
      put("S", e.missedSol, SOL);
      put("T", e.missedUsd, USD);
    }
    const notes: string[] = [];
    if (c.costUnknown) notes.push("Bought before the history, so no PnL shown");
    else if (c.partial) notes.push("Sold more than the trades read show bought; PnL covers only the part bought inside the history");
    co.getCell(`U${row}`).value = notes.join("; ");
    co.getCell(`V${row}`).value = c.mint;
  });
  co.columns = [{ width: 12 }, { width: 22 }, { width: 17 }, { width: 17 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 13 }, { width: 13 }, { width: 10 }, { width: 13 }, { width: 13 }, { width: 50 }, { width: 46 }];

  /* ---- Transactions: every buy and sell ---- */
  tr.addRow(["Time (UTC)", "Side", "Coin", "Name", "Tokens", "SOL", "Profit (SOL)", "Profit (USD)", "Fumble (USD)", "Fumble (SOL)", "Peak after sale (x)", "Peak date (UTC)", "Roundtripped (SOL)", "Roundtripped (USD)", "Note", "Coin address", "Transaction"]);
  tr.getRow(1).font = BOLD;
  tr.views = [{ state: "frozen", ySplit: 1 }];
  const trades = [...r.trades].sort((a, b) => b.time - a.time);
  trades.forEach((t, i) => {
    const row = i + 2;
    const s = t.side === "sell" ? sellBy.get(t.signature) : undefined;
    const p = closing.get(t.signature);
    const notes: string[] = [];
    if (s && s.status !== "ok" && s.reason) notes.push(`Fumble unknown: ${s.reason}`);
    if (s && s.matchedTokens < s.tokens * 0.999) notes.push(s.matchedTokens > 0 ? "Profit covers only the part bought inside the history" : "Bought before the history, so no profit shown");
    if (p && p.status !== "ok" && p.reason) notes.push(`Roundtrip unknown: ${p.reason}`);
    const name = r.tokens[t.token]?.name;
    tr.getCell(`A${row}`).value = date(t.time);
    tr.getCell(`A${row}`).numFmt = DATE_FMT;
    tr.getCell(`B${row}`).value = t.side === "buy" ? "Buy" : "Sell";
    tr.getCell(`C${row}`).value = label(t.token);
    tr.getCell(`D${row}`).value = name && name.toLowerCase() !== label(t.token).toLowerCase() ? name : "";
    tr.getCell(`E${row}`).value = t.tokens;
    tr.getCell(`E${row}`).numFmt = "#,##0.##";
    tr.getCell(`F${row}`).value = t.sol;
    tr.getCell(`F${row}`).numFmt = SOL;
    if (s && s.matchedTokens > 0) {
      tr.getCell(`G${row}`).value = s.profitSol;
      tr.getCell(`G${row}`).numFmt = SOL;
      if (s.profitUsd !== undefined) {
        tr.getCell(`H${row}`).value = s.profitUsd;
        tr.getCell(`H${row}`).numFmt = USD;
      }
    }
    if (s?.status === "ok") {
      tr.getCell(`I${row}`).value = s.fumbleUsd ?? 0;
      tr.getCell(`I${row}`).numFmt = USD;
      tr.getCell(`J${row}`).value = s.fumbleSol ?? 0;
      tr.getCell(`J${row}`).numFmt = SOL;
      if (s.peakMultiple !== undefined) {
        tr.getCell(`K${row}`).value = s.peakMultiple;
        tr.getCell(`K${row}`).numFmt = '0.0"x"';
      }
      if (s.peakAt !== undefined) {
        tr.getCell(`L${row}`).value = date(s.peakAt);
        tr.getCell(`L${row}`).numFmt = DATE_FMT;
      }
    }
    if (p?.status === "ok") {
      tr.getCell(`M${row}`).value = p.roundTripSol ?? 0;
      tr.getCell(`M${row}`).numFmt = SOL;
      tr.getCell(`N${row}`).value = p.roundTripUsd ?? 0;
      tr.getCell(`N${row}`).numFmt = USD;
    }
    tr.getCell(`O${row}`).value = notes.join("; ");
    tr.getCell(`P${row}`).value = t.token;
    if (t.signature) tr.getCell(`Q${row}`).value = { text: t.signature.slice(0, 12) + "…", hyperlink: `https://solscan.io/tx/${encodeURIComponent(t.signature)}` };
  });
  tr.columns = [{ width: 17 }, { width: 6 }, { width: 12 }, { width: 22 }, { width: 16 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 17 }, { width: 17 }, { width: 14 }, { width: 14 }, { width: 50 }, { width: 46 }, { width: 18 }];
  const last = Math.max(trades.length + 1, 2);

  /* ---- Positions ---- */
  po.addRow(["Coin", "Opened (UTC)", "Closed (UTC)", "Put in (SOL)", "Taken out (SOL)", "Kept (SOL)", "Peak profit (SOL)", "Peak date (UTC)", "Gave back (SOL)", "Gave back (USD)", "Share of peak profit", "Note"]);
  po.getRow(1).font = BOLD;
  po.views = [{ state: "frozen", ySplit: 1 }];
  const positions = [...r.positions].sort((a, b) => b.closedAt - a.closedAt);
  positions.forEach((p, i) => {
    const row = i + 2;
    po.getCell(`A${row}`).value = label(p.token);
    po.getCell(`B${row}`).value = date(p.openedAt);
    po.getCell(`B${row}`).numFmt = DATE_FMT;
    po.getCell(`C${row}`).value = date(p.closedAt);
    po.getCell(`C${row}`).numFmt = DATE_FMT;
    po.getCell(`D${row}`).value = p.costSol;
    po.getCell(`E${row}`).value = p.proceedsSol;
    po.getCell(`F${row}`).value = { formula: `E${row}-D${row}`, result: p.proceedsSol - p.costSol };
    for (const c of ["D", "E", "F"]) po.getCell(`${c}${row}`).numFmt = SOL;
    if (p.status === "ok") {
      po.getCell(`G${row}`).value = p.peakProfitSol ?? 0;
      po.getCell(`G${row}`).numFmt = SOL;
      if (p.peakAt !== undefined) {
        po.getCell(`H${row}`).value = date(p.peakAt);
        po.getCell(`H${row}`).numFmt = DATE_FMT;
      }
      po.getCell(`I${row}`).value = p.roundTripSol ?? 0;
      po.getCell(`I${row}`).numFmt = SOL;
      po.getCell(`J${row}`).value = p.roundTripUsd ?? 0;
      po.getCell(`J${row}`).numFmt = USD;
      if (p.gaveBack !== undefined) {
        po.getCell(`K${row}`).value = p.gaveBack;
        po.getCell(`K${row}`).numFmt = "0%";
      }
    } else po.getCell(`L${row}`).value = p.reason ? `No price history: ${p.reason}` : "No price history";
  });
  po.columns = [{ width: 12 }, { width: 17 }, { width: 17 }, { width: 13 }, { width: 15 }, { width: 12 }, { width: 16 }, { width: 17 }, { width: 15 }, { width: 15 }, { width: 18 }, { width: 50 }];
  const lastPos = Math.max(positions.length + 1, 2);

  /* ---- Summary: the totals are formulas over the other two sheets ---- */
  const rows: [string, ExcelJS.CellValue, string?][] = [
    ["Wallet", r.wallet],
    ["Scanned (UTC)", date(r.scannedAt), DATE_FMT],
    ["History read", r.coverage.complete ? "All of it" : r.coverage.oldest ? `Back to ${date(r.coverage.oldest).toISOString().slice(0, 10)} (older trades were not read)` : "Part of it"],
    ["Trades of 0.1 SOL or more", { formula: `COUNTA(Transactions!B2:B${last})`, result: trades.length }, "0"],
    ["Sells", { formula: `COUNTIF(Transactions!B2:B${last},"Sell")`, result: trades.filter((t) => t.side === "sell").length }, "0"],
    ["Profit (SOL)", { formula: `SUM(Transactions!G2:G${last})`, result: r.totalProfitSol }, SOL],
    ["Profit (USD)", { formula: `SUM(Transactions!H2:H${last})`, result: r.totalProfitUsd }, USD],
    ["Fumbled (USD)", { formula: `SUM(Transactions!I2:I${last})`, result: r.totalFumbleUsd }, USD],
    ["Fumbled (SOL)", { formula: `SUM(Transactions!J2:J${last})`, result: r.totalFumbleSol }, SOL],
    ["Roundtripped (SOL)", { formula: `SUM(Positions!I2:I${lastPos})`, result: r.totalRoundTripSol }, SOL],
    ["Roundtripped (USD)", { formula: `SUM(Positions!J2:J${lastPos})`, result: r.totalRoundTripUsd }, USD],
    // Fumbles and round-trips together, counting each closed position once (the larger of its two), so not the sum of the two lines above.
    ["Total fumble (SOL)", r.totalMissedSol, SOL],
    ["Total fumble (USD)", r.totalMissedUsd, USD],
    ["Sells with no price history", r.unknown, "0"],
  ];
  sum.getCell("A1").value = "Replay: fumble check";
  sum.getCell("A1").font = { bold: true, size: 14 };
  rows.forEach(([name, value, fmt], i) => {
    const row = i + 3;
    sum.getCell(`A${row}`).value = name;
    sum.getCell(`B${row}`).value = value;
    sum.getCell(`B${row}`).alignment = { horizontal: "left" };
    if (fmt) sum.getCell(`B${row}`).numFmt = fmt;
  });
  const at = rows.length + 4;
  const notes = [
    "Profit: what a sell brought in minus what the coins it sold cost, matched oldest buy first. Only the part bought inside the history counts.",
    "Fumbled: what the coins sold would have been worth at their highest price after the sale, minus what they were sold for.",
    "Roundtripped: the profit a coin showed at its peak while it was held, minus the profit kept when the position closed.",
    "Dollar figures use the SOL price at the time. Prices come from Birdeye and GeckoTerminal. This describes the past and is not financial advice.",
  ];
  notes.forEach((n, i) => (sum.getCell(`A${at + i}`).value = n));
  sum.getColumn(1).width = 34;
  sum.getColumn(2).width = 60;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
