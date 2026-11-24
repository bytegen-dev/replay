import { connectDb } from "../db.ts";
import type { Dropped, Trade } from "./types.ts";

/**
 * A wallet's saved history: every token-for-SOL trade found so far, and how far the reading got. A rescan then reads only what is new
 * since the newest saved transaction, instead of the whole history again, and the trades it already knows show at once.
 *
 * The saved stretch is always one unbroken run of the wallet's history, from `oldest` to `newest`. `complete` says whether `oldest` is
 * the very start of the wallet. Only trades are kept, not the raw transactions: they are what everything else is worked out from, and
 * they are small.
 */
export interface SavedWallet {
  trades: Trade[];
  /** The newest transaction read, to start the next rescan from (the signature is exact; the time is for show). */
  newestSig: string | null;
  newestTime: number | null;
  /** The oldest transaction read, where reading further back would start. */
  oldestSig: string | null;
  oldestTime: number | null;
  /** True when the history has been read all the way back to the wallet's first transaction. */
  complete: boolean;
  /** How many transactions were read in all, and how many of them were not token-for-SOL trades (and why). */
  transactions: number;
  dropped: Dropped;
}

export interface WalletStore {
  load(wallet: string): Promise<SavedWallet | null>;
  /** Saves the wallet's state. `added` are the trades not saved before; the rest of `saved.trades` is already there. With `replace`, `saved.trades` is the whole saved run and any other trades saved for the wallet are removed. */
  save(wallet: string, saved: SavedWallet, added: Trade[], opts?: { replace?: boolean }): Promise<void>;
}

/**
 * A store that lives in memory, for tests and for running without a database. `max` keeps only the most recently saved wallets, so it cannot grow
 * without end on a long-running server.
 */
export function memoryStore(max = Infinity): WalletStore & { wallets: Map<string, SavedWallet> } {
  const wallets = new Map<string, SavedWallet>();
  return {
    wallets,
    async load(wallet) {
      const s = wallets.get(wallet);
      return s ? { ...s, trades: [...s.trades] } : null;
    },
    async save(wallet, saved) {
      wallets.delete(wallet); // saved again: it moves to the newest end
      wallets.set(wallet, { ...saved, trades: [...saved.trades] });
      while (wallets.size > max) wallets.delete(wallets.keys().next().value as string);
    },
  };
}

type Sql = NonNullable<ReturnType<typeof connectDb>>;

const ensured = new WeakMap<object, Promise<void>>();
function tables(sql: Sql): Promise<void> {
  let p = ensured.get(sql);
  if (!p) {
    p = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS fumble_wallets (
        wallet text PRIMARY KEY, newest_sig text, newest_time bigint, oldest_sig text, oldest_time bigint, complete boolean NOT NULL DEFAULT false,
        transactions integer NOT NULL DEFAULT 0, dropped jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now())`;
      await sql`CREATE TABLE IF NOT EXISTS fumble_trades (
        wallet text NOT NULL, signature text NOT NULL, side text NOT NULL, mint text NOT NULL, tokens double precision NOT NULL,
        sol double precision NOT NULL, time bigint NOT NULL, source text, PRIMARY KEY (wallet, signature))`;
      await sql`CREATE INDEX IF NOT EXISTS fumble_trades_by_time ON fumble_trades (wallet, time DESC)`;
    })().catch((e) => {
      ensured.delete(sql);
      throw e;
    });
    ensured.set(sql, p);
  }
  return p;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** The store on Postgres (Neon in production, the docker-compose database locally). Null when there is no database. */
export function sqlStore(sql: Sql | null = connectDb()): WalletStore | null {
  if (!sql) return null;
  return {
    async load(wallet) {
      await tables(sql);
      const rows = (await sql`SELECT newest_sig, newest_time, oldest_sig, oldest_time, complete, transactions, dropped FROM fumble_wallets WHERE wallet = ${wallet}`) as Record<string, unknown>[];
      if (!rows.length) return null;
      const w = rows[0];
      const trades = (await sql`SELECT signature, side, mint, tokens, sol, time, source FROM fumble_trades WHERE wallet = ${wallet} ORDER BY time DESC`) as Record<string, unknown>[];
      return {
        newestSig: (w.newest_sig as string | null) ?? null,
        newestTime: num(w.newest_time),
        oldestSig: (w.oldest_sig as string | null) ?? null,
        oldestTime: num(w.oldest_time),
        complete: w.complete === true,
        transactions: Number(w.transactions) || 0,
        dropped: { noTokenMove: 0, multiToken: 0, noSolLeg: 0, ...(w.dropped as Partial<Dropped>) },
        trades: trades.map((t) => ({ signature: t.signature as string, side: t.side as "buy" | "sell", mint: t.mint as string, tokens: Number(t.tokens), sol: Number(t.sol), time: Number(t.time), ...(t.source ? { source: t.source as string } : {}) })),
      };
    },
    async save(wallet, s, added, opts) {
      await tables(sql);
      const state = sql`INSERT INTO fumble_wallets (wallet, newest_sig, newest_time, oldest_sig, oldest_time, complete, transactions, dropped, updated_at)
        VALUES (${wallet}, ${s.newestSig}, ${s.newestTime}, ${s.oldestSig}, ${s.oldestTime}, ${s.complete}, ${s.transactions}, ${JSON.stringify(s.dropped)}::jsonb, now())
        ON CONFLICT (wallet) DO UPDATE SET newest_sig = EXCLUDED.newest_sig, newest_time = EXCLUDED.newest_time, oldest_sig = EXCLUDED.oldest_sig,
          oldest_time = EXCLUDED.oldest_time, complete = EXCLUDED.complete, transactions = EXCLUDED.transactions, dropped = EXCLUDED.dropped, updated_at = now()`;
      const clear = opts?.replace ? sql`DELETE FROM fumble_trades WHERE wallet = ${wallet} AND signature <> ALL(${s.trades.map((t) => t.signature)}::text[])` : null;
      if (!added.length) return void (clear ? await sql.transaction([state, clear]) : await state);
      const rows = sql`INSERT INTO fumble_trades (wallet, signature, side, mint, tokens, sol, time, source)
        SELECT ${wallet}, * FROM unnest(${added.map((t) => t.signature)}::text[], ${added.map((t) => t.side)}::text[], ${added.map((t) => t.mint)}::text[],
          ${added.map((t) => t.tokens)}::float8[], ${added.map((t) => t.sol)}::float8[], ${added.map((t) => t.time)}::bigint[], ${added.map((t) => t.source ?? null)}::text[])
        ON CONFLICT (wallet, signature) DO NOTHING`;
      await sql.transaction(clear ? [state, rows, clear] : [state, rows]);
    },
  };
}
