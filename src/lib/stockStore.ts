import { neon } from "@neondatabase/serverless";
import type { StockDay, StockMeta } from "./stocks.ts";

/**
 * A saved copy of each ticker's price history in the same Neon database the share links use. Yahoo rate-limits
 * shared server addresses, so a recent copy keeps most requests off Yahoo entirely, and an older one can still
 * answer when Yahoo refuses. Everything here quietly does nothing without DATABASE_URL.
 */

export interface StoredHistory {
  meta: StockMeta;
  days: StockDay[];
  /** When the copy was fetched from Yahoo (ms since epoch). */
  fetchedAt: number;
}

function connect() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}
type Sql = NonNullable<ReturnType<typeof connect>>;

let ready: Promise<void> | null = null;
function ensureTable(sql: Sql): Promise<void> {
  ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS stock_history (
      symbol text PRIMARY KEY,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      meta jsonb NOT NULL,
      days jsonb NOT NULL
    )`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Days as compact [date, close, adjClose] triples to keep the stored row small. */
const pack = (days: StockDay[]) => days.map((d) => [d.date, Math.round(d.close * 1e6) / 1e6, Math.round(d.adjClose * 1e6) / 1e6]);
const unpack = (rows: [string, number, number][]): StockDay[] => rows.map(([date, close, adjClose]) => ({ date, close, adjClose }));

export async function readHistory(symbol: string): Promise<StoredHistory | null> {
  try {
    const sql = connect();
    if (!sql) return null;
    await ensureTable(sql);
    const rows = (await sql`SELECT meta, days, (extract(epoch from fetched_at) * 1000)::float8 AS at FROM stock_history WHERE symbol = ${symbol}`) as {
      meta: StockMeta;
      days: [string, number, number][];
      at: number;
    }[];
    const r = rows[0];
    return r ? { meta: r.meta, days: unpack(r.days), fetchedAt: Number(r.at) } : null;
  } catch {
    return null; // a database hiccup must never break a calculation
  }
}

export async function writeHistory(symbol: string, meta: StockMeta, days: StockDay[]): Promise<void> {
  try {
    const sql = connect();
    if (!sql) return;
    await ensureTable(sql);
    await sql`INSERT INTO stock_history (symbol, fetched_at, meta, days)
      VALUES (${symbol}, now(), ${JSON.stringify(meta)}::jsonb, ${JSON.stringify(pack(days))}::jsonb)
      ON CONFLICT (symbol) DO UPDATE SET fetched_at = now(), meta = EXCLUDED.meta, days = EXCLUDED.days`;
  } catch {
    /* best effort */
  }
}
