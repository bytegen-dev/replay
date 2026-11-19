import { planInfo } from "./plan.ts";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { noteText, prepare, type ExportPayload } from "./exportData.ts";

const LOGO_PATH = path.join(process.cwd(), "public", "replay-logo-light.png");

const BLUE = { color: { argb: "FF0000FF" } };
const BLACK = { color: { argb: "FF000000" } };
const BOLD = { bold: true };

export async function buildWorkbook(p: ExportPayload): Promise<Buffer> {
  const { buys, summary, decimals } = prepare(p);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Replay";

  const n = buys.length;
  const last = n + 1; // header is row 1
  const sum = wb.addWorksheet("Summary");
  const buy = wb.addWorksheet("Buys");
  const src = wb.addWorksheet("Sources");

  /* ---- Buys: C is the only hardcoded input per row (blue); everything else is a formula ---- */
  buy.addRow(["Month", "Price date", "Price (USD)", "Amount (USD)", p.unit === "shares" ? "Shares bought" : "Tokens bought", p.sold ? "Value at sale (USD)" : "Value today (USD)", "Source", "Note"]);
  buy.getRow(1).font = BOLD;
  buys.forEach((b, i) => {
    const r = i + 2;
    const priced = b.price !== null;
    buy.getCell(`A${r}`).value = b.month;
    buy.getCell(`B${r}`).value = b.priceDate ?? (b.manual ? "manual" : "");
    if (priced) {
      buy.getCell(`C${r}`).value = b.price as number;
      buy.getCell(`C${r}`).font = BLUE;
    }
    // A month between buys under the plan spends nothing; every other month spends the amount if it has a price.
    buy.getCell(`D${r}`).value = b.buy === false ? 0 : { formula: `IF(ISNUMBER(C${r}),Summary!$B$4,0)`, result: priced ? p.amount : 0 };
    buy.getCell(`E${r}`).value = { formula: `IF(ISNUMBER(C${r}),ROUND(D${r}/C${r},Summary!$B$5),"")`, result: b.tokens ?? "" };
    buy.getCell(`F${r}`).value = {
      formula: `IF(AND(ISNUMBER(E${r}),ISNUMBER(Summary!$B$6)),E${r}*Summary!$B$6,"")`,
      result: b.valueToday ?? "",
    };
    for (const c of ["D", "E", "F"]) buy.getCell(`${c}${r}`).font = BLACK;
    buy.getCell(`G${r}`).value = b.source === "none" ? "n/a" : b.source;
    buy.getCell(`G${r}`).font = BLUE;
    buy.getCell(`H${r}`).value = noteText(b);
    buy.getCell(`C${r}`).numFmt = "0.00000000";
    buy.getCell(`D${r}`).numFmt = "#,##0.00";
    buy.getCell(`E${r}`).numFmt = decimals ? `#,##0.${"0".repeat(decimals)}` : "#,##0";
    buy.getCell(`F${r}`).numFmt = "#,##0.00";
  });
  buy.columns = [{ width: 10 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 80 }];

  /* ---- Summary ---- */
  const rows: [string, ExcelJS.CellValue, "input" | "formula" | "text", string?][] = [
    ["Token", p.tokenLabel || "unknown", "text"],
    ["Chain", p.chain, "text"],
    [p.plan && p.plan !== "monthly" ? `Amount each buy (USD, ${p.plan === "once" ? "once" : planInfo(p.plan).phrase})` : "Monthly amount (USD)", p.amount, "input", "#,##0.00"],
    ["Token rounding (decimals)", decimals, "input", "0"],
    [p.sold ? "Price at sale (USD)" : "Price today (USD)", p.currentPrice ?? "", "input", "0.00000000"],
    ["Price basis", p.basis, "text"],
    ["Total invested (USD)", { formula: `SUM(Buys!D2:D${last})`, result: summary.invested }, "formula", "#,##0.00"],
    [p.unit === "shares" ? "Total shares" : "Total tokens", { formula: `SUM(Buys!E2:E${last})`, result: summary.tokens }, "formula", decimals ? `#,##0.${"0".repeat(decimals)}` : "#,##0"],
    ["Average buy price (USD)", { formula: `IF(B9>0,B8/B9,"n/a")`, result: summary.avgPrice ?? "n/a" }, "formula", "0.00000000"],
    [p.sold ? "Value at sale (USD)" : "Value today (USD)", { formula: `IF(ISNUMBER(B6),B9*B6,"n/a")`, result: summary.valueToday ?? "n/a" }, "formula", "#,##0.00"],
    ["Gain / loss (USD)", { formula: `IF(ISNUMBER(B11),B11-B8,"n/a")`, result: summary.gain ?? "n/a" }, "formula", "#,##0.00"],
    ["Gain / loss (%)", { formula: `IF(AND(ISNUMBER(B12),B8>0),B12/B8,"n/a")`, result: summary.gainPct === null ? "n/a" : summary.gainPct / 100 }, "formula", "0.00%"],
    p.plan && p.plan !== "monthly"
      ? ["Buys with no price (excluded)", summary.skippedMonths, "text", "0"]
      : ["Months with no price (excluded)", { formula: `ROWS(Buys!C2:C${last})-COUNT(Buys!C2:C${last})`, result: summary.skippedMonths }, "formula", "0"],
  ];
  sum.getRow(1).height = 44;
  sum.mergeCells("B1:D1");
  sum.getCell("B1").value = "Replay";
  sum.getCell("B1").font = { bold: true, size: 14 };
  sum.getCell("B1").alignment = { vertical: "middle" };
  if (fs.existsSync(LOGO_PATH)) {
    const imageId = wb.addImage({ filename: LOGO_PATH, extension: "png" });
    sum.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 48, height: 48 } });
  }
  // Row map (Buys formulas depend on it): Token=2, Chain=3, Amount=4, Decimals=5, PriceToday=6,
  // Basis=7, Invested=8, Tokens=9, Avg=10, Value=11, Gain=12, Gain%=13, Skipped=14.
  rows.forEach(([label, value, kind, fmt], i) => {
    const r = i + 2;
    sum.getCell(`A${r}`).value = label;
    sum.getCell(`B${r}`).value = value;
    sum.getCell(`B${r}`).font = kind === "input" ? BLUE : BLACK;
    if (fmt) sum.getCell(`B${r}`).numFmt = fmt;
  });
  sum.getColumn(1).width = 34;
  sum.getColumn(2).width = 26;
  sum.getCell("A16").value = "Blue = hardcoded input. Black = formula. " + (p.sold ? "Sold at the end month, price as of " : "Price today as of ") + (p.currentPriceDate || "n/a") + ".";
  sum.getCell("A16").font = { italic: true };

  /* ---- Sources ---- */
  src.addRow(["Source", "URL", "Notes"]);
  src.getRow(1).font = BOLD;
  for (const s of p.sources) src.addRow([s.label, s.url, ""]);
  src.addRow(["CoinGecko API docs", "https://docs.coingecko.com/", "Daily prices; free tier limited to the last 365 days"]);
  src.addRow(["GeckoTerminal API docs", "https://www.geckoterminal.com/dex-api", "Pool daily OHLCV; not available for all tokens (e.g. Cardano)"]);
  const flagged = buys.filter((b) => b.notes.length);
  if (flagged.length) {
    src.addRow([]);
    src.addRow(["Month notes"]).font = BOLD;
    for (const b of flagged) src.addRow([b.month, "", noteText(b)]);
  }
  src.columns = [{ width: 32 }, { width: 70 }, { width: 80 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
