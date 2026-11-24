import { connectDb } from "../db.ts";
import { isWalletAddress } from "./helius.ts";

/**
 * The wallets of well-known traders ("KOLs"), so a name can be typed instead of an address. The list comes from Solana Tracker's KOL leaderboard
 * (a free key allows 2,500 calls a month; the whole list is a few calls), is saved in the database, and is fetched again at most once a day.
 * Searches read the saved copy, so they cost no calls.
 */

export interface Kol {
  name: string;
  /** The X handle without the @, when it looks like one. */
  twitter?: string;
  wallet: string;
}

const HOST = "https://data.solanatracker.io";
const PAGE = 500;
const MAX_PAGES = 8;

/** A name as shown: control and invisible characters removed, trimmed, and short. */
function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩]/g, "").trim().slice(0, 40);
  return s.length >= 2 ? s : null;
}

function cleanHandle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const h = raw.replace(/^@+/, "").trim();
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : undefined;
}

/** The KOLs that have a public name, read from one page of the leaderboard. */
export function parseKols(json: unknown): { kols: Kol[]; next: string | null } {
  const body = json as { traders?: { wallet?: unknown; identity?: { name?: unknown; twitter?: unknown } }[]; pagination?: { hasMore?: boolean; nextCursor?: unknown } } | null;
  const kols: Kol[] = [];
  for (const t of body?.traders ?? []) {
    const name = cleanName(t.identity?.name);
    const wallet = typeof t.wallet === "string" ? t.wallet : "";
    if (!name || !isWalletAddress(wallet)) continue;
    const twitter = cleanHandle(t.identity?.twitter);
    kols.push({ name, ...(twitter ? { twitter } : {}), wallet });
  }
  const next = body?.pagination?.hasMore && typeof body.pagination.nextCursor === "string" ? body.pagination.nextCursor : null;
  return { kols, next };
}

/** The whole list: every page of the leaderboard, one wallet once. Throws when a call fails (with nothing in the message that names the key). */
export async function fetchKols(apiKey: string, fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i)): Promise<Kol[]> {
  const byWallet = new Map<string, Kol>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url: string = `${HOST}/v2/pnl/leaderboard/kols?limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetchImpl(url, { headers: { "x-api-key": apiKey, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`KOL list failed (${res.status})`);
    const { kols, next } = parseKols(await res.json());
    for (const k of kols) byWallet.set(k.wallet, k);
    if (!next) break;
    cursor = next;
  }
  return [...byWallet.values()];
}

/** The KOLs that match what was typed: names that start with it first, then X handles that do, then names and handles that contain it. */
export function searchKols(list: Kol[], query: string, limit = 6): Kol[] {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return [];
  const scored: { k: Kol; score: number }[] = [];
  for (const k of list) {
    const n = k.name.toLowerCase();
    const t = k.twitter?.toLowerCase() ?? "";
    const score = n === q ? 0 : n.startsWith(q) ? 1 : t.startsWith(q) ? 2 : n.includes(q) ? 3 : t.includes(q) ? 4 : -1;
    if (score >= 0) scored.push({ k, score });
  }
  scored.sort((a, b) => a.score - b.score || a.k.name.length - b.k.name.length || a.k.name.localeCompare(b.k.name));
  return scored.slice(0, limit).map((s) => s.k);
}

/* ------------------------------ saving ------------------------------ */

export interface KolStore {
  load(): Promise<{ kols: Kol[]; at: number } | null>;
  save(kols: Kol[], at: number): Promise<void>;
}

export function memoryKolStore(): KolStore {
  let saved: { kols: Kol[]; at: number } | null = null;
  return {
    async load() {
      return saved;
    },
    async save(kols, at) {
      saved = { kols, at };
    },
  };
}

type Sql = NonNullable<ReturnType<typeof connectDb>>;

export function sqlKolStore(sql: Sql | null = connectDb()): KolStore | null {
  if (!sql) return null;
  let ready: Promise<unknown> | null = null;
  const table = () =>
    (ready ??= sql`CREATE TABLE IF NOT EXISTS fumble_kols (wallet text PRIMARY KEY, name text NOT NULL, twitter text, saved_at bigint NOT NULL)`.catch((e) => {
      ready = null;
      throw e;
    }));
  return {
    async load() {
      await table();
      const rows = (await sql`SELECT wallet, name, twitter, saved_at FROM fumble_kols`) as Record<string, unknown>[];
      if (!rows.length) return null;
      return {
        at: Math.max(...rows.map((r) => Number(r.saved_at) || 0)),
        kols: rows.map((r) => ({ wallet: r.wallet as string, name: r.name as string, ...(r.twitter ? { twitter: r.twitter as string } : {}) })),
      };
    },
    async save(kols, at) {
      await table();
      const clear = sql`DELETE FROM fumble_kols`;
      const insert = sql`INSERT INTO fumble_kols (wallet, name, twitter, saved_at)
        SELECT * FROM unnest(${kols.map((k) => k.wallet)}::text[], ${kols.map((k) => k.name)}::text[], ${kols.map((k) => k.twitter ?? null)}::text[], ${kols.map(() => at)}::bigint[])`;
      await sql.transaction([clear, insert]);
    },
  };
}

/* ------------------------------ the directory ------------------------------ */

export interface KolDirectoryOptions {
  apiKey: string;
  store: KolStore;
  /** How old the list may get before it is fetched again. Default a day. */
  maxAgeSeconds?: number;
  now?: () => number;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Searches the list, keeping it fresh: loaded from the store, and fetched again (once at a time) when it is older than `maxAgeSeconds`. A fetch that
 * fails or finds nothing leaves the old list in use, so a hiccup never empties the search.
 */
export function createKolDirectory(opts: KolDirectoryOptions) {
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const maxAge = opts.maxAgeSeconds ?? 86400;
  let current: { kols: Kol[]; at: number } | null = null;
  let loaded = false;
  let refreshing: Promise<void> | null = null;
  let lastTry = 0;

  async function ensure(): Promise<void> {
    if (!loaded) {
      loaded = true;
      try {
        current = await opts.store.load();
      } catch {
        current = null;
      }
    }
    const stale = !current || now() - current.at >= maxAge;
    // After a failed fetch, wait a few minutes before trying again, so a down service is not asked on every keystroke.
    if (!stale || now() - lastTry < 300) return;
    refreshing ??= (async () => {
      lastTry = now();
      try {
        const kols = await fetchKols(opts.apiKey, opts.fetchImpl);
        if (kols.length > 0) {
          current = { kols, at: now() };
          await opts.store.save(kols, current.at).catch(() => {
            /* not saving is no reason to fail the search */
          });
        }
      } catch {
        /* the old list stays */
      } finally {
        refreshing = null;
      }
    })();
    // Only a search with nothing to search yet has to wait for the fetch.
    if (!current) await refreshing;
  }

  return {
    async search(query: string, limit = 6): Promise<Kol[]> {
      await ensure();
      return current ? searchKols(current.kols, query, limit) : [];
    },
  };
}
