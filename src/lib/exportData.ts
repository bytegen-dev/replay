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
}

export interface Prepared {
  buys: BuyRow[];
  summary: Summary;
  decimals: number;
}

export function prepare(p: ExportPayload): Prepared {
  const effective = p.rows.map((r) => ({ price: p.overrides[r.month] > 0 ? p.overrides[r.month] : r.price }));
  const decimals = chooseDecimals(effective, p.amount);
  const buys = buildBuys(p.rows, p.amount, p.currentPrice, p.overrides, decimals);
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
  };
}

export function noteText(b: BuyRow): string {
  return b.notes.map((n) => n.text).join("; ");
}