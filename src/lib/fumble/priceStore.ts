import { connectDb } from "../db.ts";
import { SOL_MINT, type PriceSeries } from "./prices.ts";
import type { Candle } from "./types.ts";

/**
 * Price history saved in the database, so a coin is priced once for everyone, not once per server instance.
 *
 * The in-memory cache in `sharedPrices` is lost whenever a serverless instance goes away, and every instance has its own copy of the
 * provider limiters, so a busy hour sends many instances at a one-request-a-second key. A saved series is shared by all of them, and the
 * cost of pricing then follows the number of different coins traded, not the number of wallets scanned.
 *
 * A saved series covers `from` to `to` (seconds): what the request asked for when it was fetched. It answers a later request that starts no
 * earlier than `from` and ends no more than `maxAgeSeconds` after `to`. The SOL price is saved one hour at a time and never changes once the
 * hour is over, so those rows are always good. Coins with no price history are not saved (a hiccup in both providers must not hide a coin).
 */

export interface SavedSeries {
  from: number;
  to: number;
  source: string;
  candles: Candle[];
}

export interface PriceStore {
  load(key: string): Promise<SavedSeries | null>;
  save(key: string, series: SavedSeries): Promise<void>;
}

/** SOL is asked for one hour at a time, so each hour is its own row; every other coin has one row. */
export const priceKey = (mint: string, from: number) => (mint === SOL_MINT ? `${mint}@${from}` : mint);

export function memoryPriceStore(): PriceStore & { rows: Map<string, SavedSeries> } {
  const rows = new Map<string, SavedSeries>();
  return {
    rows,
    async load(key) {
      return rows.get(key) ?? null;
    },
    async save(key, series) {
      rows.set(key, series);
    },
  };
}

type Sql = NonNullable<ReturnType<typeof connectDb>>;

const ensured = new WeakMap<object, Promise<void>>();
function table(sql: Sql): Promise<void> {
  let p = ensured.get(sql);
  if (!p) {
    p = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS fumble_prices (
        key text PRIMARY KEY, from_time bigint NOT NULL, to_time bigint NOT NULL, source text NOT NULL, candles jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    })().catch((e) => {
      ensured.delete(sql);
      throw e;
    });
    ensured.set(sql, p);
  }
  return p;
}

/** Candles as [time, high, low, close, volume] rows: about half the size of objects, and they are the bulk of every row. */
const pack = (candles: Candle[]) => candles.map((c) => [c.t, c.h, c.l, c.c, c.v ?? null]);
const unpack = (rows: unknown): Candle[] =>
  Array.isArray(rows) ? rows.map((r: (number | null)[]) => ({ t: Number(r[0]), h: Number(r[1]), l: Number(r[2]), c: Number(r[3]), ...(r[4] === null || r[4] === undefined ? {} : { v: Number(r[4]) }) })) : [];

/** The store on Postgres. Null when there is no database. */
export function sqlPriceStore(sql: Sql | null = connectDb()): PriceStore | null {
  if (!sql) return null;
  return {
    async load(key) {
      await table(sql);
      const rows = (await sql`SELECT from_time, to_time, source, candles FROM fumble_prices WHERE key = ${key}`) as Record<string, unknown>[];
      if (!rows.length) return null;
      const r = rows[0];
      return { from: Number(r.from_time), to: Number(r.to_time), source: String(r.source), candles: unpack(r.candles) };
    },
    async save(key, s) {
      await table(sql);
      await sql`INSERT INTO fumble_prices (key, from_time, to_time, source, candles, updated_at)
        VALUES (${key}, ${s.from}, ${s.to}, ${s.source}, ${JSON.stringify(pack(s.candles))}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET from_time = EXCLUDED.from_time, to_time = EXCLUDED.to_time, source = EXCLUDED.source, candles = EXCLUDED.candles, updated_at = now()`;
    },
  };
}

type Lookup = (mint: string, from: number, now: number) => Promise<PriceSeries | null>;

/**
 * Puts a store under a price lookup: a saved series that covers the request is returned without calling the providers; otherwise the lookup
 * runs and a found series is saved. A store that fails to read or write is ignored, as if there were no store.
 */
export function savedPrices(inner: Lookup, store: PriceStore, opts: { maxAgeSeconds?: number } = {}): Lookup {
  const maxAge = opts.maxAgeSeconds ?? 3 * 3600;
  return async (mint, from, now) => {
    const key = priceKey(mint, from);
    try {
      const hit = await store.load(key);
      if (hit && hit.candles.length && hit.from <= from && hit.to + maxAge >= now) return { candles: hit.candles, source: hit.source };
    } catch {
      /* no saved copy to use */
    }
    const series = await inner(mint, from, now);
    if (series && series.candles.length) {
      void store.save(key, { from, to: now, source: series.source, candles: series.candles }).catch(() => {
        /* not saving is no reason to fail the lookup */
      });
    }
    return series;
  };
}
