import { isPlan, type Plan } from "./plan.ts";
import { buildBuys, chooseDecimals, summarize, type BuyRow, type Overrides, type Summary } from "./math.ts";
import type { MonthRow, SourceLink } from "./types.ts";

/** What the browser posts to the export routes. Totals are recomputed server-side from this. */
export interface ExportPayload {
  tokenLabel: string;
  chain: string;
  address: string;
  basis: string;
  amount: number;
  currentPrice: number | null;
  currentPriceDate: string;
  rows: MonthRow[];
  overrides: Overrides;
  sources: SourceLink[];
  /** What was bought: "tokens" for crypto, "shares" for stocks. Only changes wording. */
  unit?: "tokens" | "shares";
  /** How often the amount was bought. Absent means every month. */
  plan?: Plan;
  /** Set when the holding was sold at the end month, so the value is the end month's, not today's. */
  sold?: boolean;
  /** Set when `amount` is in a currency other than USD; each row then carries its exchange rate in `fx`. */
  currency?: { code: string; symbol: string; perUsdToday: number | null };
}

export interface Prepared {
  buys: BuyRow[];
  summary: Summary;
  decimals: number;
}

export function prepare(p: ExportPayload): Prepared {
  const effective = p.rows.map((r) => ({ price: p.overrides[r.month] > 0 ? p.overrides[r.month] : r.price, fx: r.fx }));
  const decimals = chooseDecimals(effective, p.amount);
  const buys = buildBuys(p.rows, p.amount, p.currentPrice, p.overrides, decimals, p.plan);
  return { buys, summary: summarize(buys, p.currentPrice), decimals };
}

export function parsePayload(x: unknown): ExportPayload | string {
  const p = x as Partial<ExportPayload> | null;
  if (!p || typeof p !== "object") return "Body must be an object";
  if (!Array.isArray(p.rows) || p.rows.length === 0) return "rows are required";
  if (!(typeof p.amount === "number" && p.amount > 0)) return "amount must be > 0";
  for (const r of p.rows) {
    if (typeof r?.month !== "string" || !(r.price === null || (typeof r.price === "number" && r.price > 0))) {
      return "rows contain an invalid month or price";
    }
  }
  return {
    tokenLabel: String(p.tokenLabel ?? ""),
    chain: String(p.chain ?? ""),
    address: String(p.address ?? ""),
    basis: String(p.basis ?? ""),
    amount: p.amount,
    currentPrice: typeof p.currentPrice === "number" && p.currentPrice > 0 ? p.currentPrice : null,
    currentPriceDate: String(p.currentPriceDate ?? ""),
    rows: p.rows as MonthRow[],
    overrides: (p.overrides ?? {}) as Overrides,
    sources: Array.isArray(p.sources) ? (p.sources as SourceLink[]) : [],
    unit: p.unit === "shares" ? "shares" : "tokens",
    ...(isPlan(p.plan) && p.plan !== "monthly" ? { plan: p.plan } : {}),
    ...(p.sold === true ? { sold: true } : {}),
    ...(p.currency && typeof p.currency.code === "string" && /^[A-Z]{3}$/.test(p.currency.code) ? { currency: { code: p.currency.code, symbol: String(p.currency.symbol ?? "").slice(0, 6), perUsdToday: typeof p.currency.perUsdToday === "number" && p.currency.perUsdToday > 0 ? p.currency.perUsdToday : null } } : {}),
  };
}

/**
 * File name for the spreadsheet: the token and the months it covers, e.g. replay-pepe-2024-12-to-2026-10.xlsx.
 * One month gives replay-pepe-2025-10.xlsx. Anything unsafe in the token label is flattened to a dash.
 */
export function xlsxFileName(p: { tokenLabel: string; rows: { month: string }[] }): string {
  const slug = p.tokenLabel.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "result";
  const months = p.rows.map((r) => r.month).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
  const range = months.length === 0 ? "" : months[0] === months[months.length - 1] ? `-${months[0]}` : `-${months[0]}-to-${months[months.length - 1]}`;
  return `replay-${slug}${range}.xlsx`;
}

export function noteText(b: BuyRow): string {
  return b.notes.map((n) => n.text).join("; ");
}