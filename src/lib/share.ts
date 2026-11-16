import { createHash, randomBytes } from "node:crypto";
import type { ExportPayload } from "./exportData.ts";
import type { MonthRow, Note, NoteCode, PriceSource, SourceLink } from "./types.ts";

/** What a public share link stores: the export data plus what the read-only page needs to show it. */
export interface SharePayload extends ExportPayload {
  tokenName: string;
  warnings: string[];
}

/** Hard cap on the posted body. A 72-month result is well under 100 KB. */
export const MAX_SHARE_BYTES = 200_000;
const MAX_ROWS = 72;
const MAX_STR = 300;
const MAX_NOTES = 8;
const MAX_SOURCES = 10;
const MAX_WARNINGS = 10;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_CODES: NoteCode[] = ["nearest-day", "low-volume", "outlier", "no-data", "out-of-range", "future", "manual"];
const SOURCES: PriceSource[] = ["CoinGecko", "GeckoTerminal", "DexHunter", "manual", "none"];

/** 8 URL-safe characters (48 random bits). Unguessable enough for an unlisted link. */
export function newShareId(): string {
  return randomBytes(6).toString("base64url");
}

/** The secret that lets the creator delete a share. Only its hash is stored. */
export function newDeleteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isShareId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8}$/.test(id);
}

const str = (x: unknown, max = MAX_STR): string => (typeof x === "string" ? x.slice(0, max) : "");
const posNum = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);

function cleanRow(x: unknown): MonthRow | null {
  const r = x as Partial<MonthRow> | null;
  if (!r || typeof r !== "object" || typeof r.month !== "string" || !MONTH.test(r.month)) return null;
  if (r.price !== null && posNum(r.price) === null) return null;
  const notes: Note[] = [];
  for (const n of Array.isArray(r.notes) ? r.notes.slice(0, MAX_NOTES) : []) {
    if (n && NOTE_CODES.includes(n.code)) notes.push({ code: n.code, text: str(n.text) });
  }
  return {
    month: r.month,
    targetDate: typeof r.targetDate === "string" && DAY.test(r.targetDate) ? r.targetDate : "",
    priceDate: typeof r.priceDate === "string" && DAY.test(r.priceDate) ? r.priceDate : null,
    price: r.price ?? null,
    source: SOURCES.includes(r.source as PriceSource) ? (r.source as PriceSource) : "none",
    notes,
  };
}

/** Only plain https links are kept, so a share page can never render a javascript: or data: link. */
function cleanSources(x: unknown): SourceLink[] {
  const out: SourceLink[] = [];
  for (const s of Array.isArray(x) ? x.slice(0, MAX_SOURCES) : []) {
    const url = str(s?.url, 500);
    if (/^https:\/\/[^\s]+$/.test(url)) out.push({ label: str(s?.label), url });
  }
  return out;
}

/**
 * Validates and rebuilds a share payload from untrusted input. Nothing is copied through
 * as-is, so the stored JSON has exactly the fields the read-only page expects.
 */
export function parseShare(x: unknown): SharePayload | string {
  const p = x as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return "Body must be an object";
  if (!Array.isArray(p.rows) || p.rows.length === 0) return "rows are required";
  if (p.rows.length > MAX_ROWS) return `At most ${MAX_ROWS} months can be shared`;
  const amount = posNum(p.amount);
  if (amount === null) return "amount must be > 0";

  const rows: MonthRow[] = [];
  for (const r of p.rows) {
    const row = cleanRow(r);
    if (!row) return "rows contain an invalid month or price";
    rows.push(row);
  }

  const overrides: Record<string, number> = {};
  const rawOverrides = p.overrides && typeof p.overrides === "object" ? (p.overrides as Record<string, unknown>) : {};
  for (const [month, v] of Object.entries(rawOverrides)) {
    const n = posNum(v);
    if (MONTH.test(month) && n !== null) overrides[month] = n;
  }

  return {
    tokenLabel: str(p.tokenLabel, 60),
    tokenName: str(p.tokenName, 100),
    chain: str(p.chain, 40),
    address: str(p.address, 120),
    basis: str(p.basis, 60),
    amount,
    currentPrice: posNum(p.currentPrice),
    currentPriceDate: DAY.test(str(p.currentPriceDate, 10)) ? str(p.currentPriceDate, 10) : "",
    rows,
    overrides,
    sources: cleanSources(p.sources),
    warnings: (Array.isArray(p.warnings) ? p.warnings.slice(0, MAX_WARNINGS) : []).map((w) => str(w, 500)).filter(Boolean),
  };
}
