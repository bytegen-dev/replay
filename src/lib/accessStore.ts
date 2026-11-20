import { createHmac, randomBytes, randomInt } from "node:crypto";
import { accessConfigured, accessToken, checkCode, cookieValue, same, ACCESS_COOKIE } from "./access.ts";
import { connectDb } from "./db.ts";
import { decrypt, encrypt } from "./vault.ts";

/**
 * Access codes and Tiingo keys kept in the database and managed from the admin page. A code lets a browser use one Tiingo key
 * (the key linked to it, or the TIINGO_API_KEY from the environment when none is linked). The codes set in the environment
 * (ACCESS_CODE with TIINGO_API_KEY) keep working beside them, as the built-in code.
 */

type Sql = NonNullable<ReturnType<typeof connectDb>>;
export class StoreUnavailable extends Error {}

function connect(): Sql {
  const sql = connectDb();
  if (!sql) throw new StoreUnavailable("There is no database. Set DATABASE_URL.");
  return sql;
}

let ready: Promise<void> | null = null;
function ensureTables(sql: Sql): Promise<void> {
  ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS subscribers (email text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS tiingo_keys (
      id text PRIMARY KEY,
      label text NOT NULL,
      secret text NOT NULL,
      last4 text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS access_codes (
      id text PRIMARY KEY,
      code text NOT NULL UNIQUE,
      label text NOT NULL DEFAULT '',
      key_id text,
      enabled boolean NOT NULL DEFAULT true,
      uses int NOT NULL DEFAULT 0,
      last_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function db(): Promise<Sql> {
  const sql = connect();
  await ensureTables(sql);
  return sql;
}

const newId = () => randomBytes(6).toString("base64url");
const FOUR = /^\d{4}$/;

/* ------------------------------ the admin page's data ------------------------------ */

export interface SubscriberRow {
  email: string;
  createdAt: string;
}
export interface KeyRow {
  id: string;
  label: string;
  last4: string;
  createdAt: string;
  codes: number;
}
export interface CodeRow {
  id: string;
  code: string;
  label: string;
  keyId: string | null;
  enabled: boolean;
  uses: number;
  lastUsedAt: string | null;
  createdAt: string;
}
export interface AdminData {
  subscribers: SubscriberRow[];
  keys: KeyRow[];
  codes: CodeRow[];
  /** What the environment provides: the built-in code and key, shown so the admin knows what else is in play. */
  env: { code: boolean; key: boolean };
}

export async function loadAdminData(): Promise<AdminData> {
  const sql = await db();
  const [subs, keys, codes] = await Promise.all([
    sql`SELECT email, created_at FROM subscribers ORDER BY created_at DESC`,
    sql`SELECT k.id, k.label, k.last4, k.created_at, (SELECT count(*)::int FROM access_codes c WHERE c.key_id = k.id) AS codes FROM tiingo_keys k ORDER BY k.created_at DESC`,
    sql`SELECT id, code, label, key_id, enabled, uses, last_used_at, created_at FROM access_codes ORDER BY created_at DESC`,
  ]);
  return {
    subscribers: (subs as { email: string; created_at: string }[]).map((r) => ({ email: r.email, createdAt: new Date(r.created_at).toISOString() })),
    keys: (keys as { id: string; label: string; last4: string; created_at: string; codes: number }[]).map((r) => ({ id: r.id, label: r.label, last4: r.last4, createdAt: new Date(r.created_at).toISOString(), codes: r.codes })),
    codes: (codes as { id: string; code: string; label: string; key_id: string | null; enabled: boolean; uses: number; last_used_at: string | null; created_at: string }[]).map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      keyId: r.key_id,
      enabled: r.enabled,
      uses: r.uses,
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    env: { code: accessConfigured(), key: (process.env.TIINGO_API_KEY ?? "").trim().length > 0 },
  };
}

export async function removeSubscriber(email: string): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM subscribers WHERE email = ${email.trim().toLowerCase()}`;
}

export async function addKey(label: string, secret: string): Promise<string> {
  const sql = await db();
  const id = newId();
  await sql`INSERT INTO tiingo_keys (id, label, secret, last4) VALUES (${id}, ${label.slice(0, 60)}, ${encrypt(secret)}, ${secret.slice(-4)})`;
  return id;
}

/** Removes a key. Codes that used it fall back to the environment key. */
export async function removeKey(id: string): Promise<void> {
  const sql = await db();
  await sql`UPDATE access_codes SET key_id = NULL WHERE key_id = ${id}`;
  await sql`DELETE FROM tiingo_keys WHERE id = ${id}`;
}

/** A four-digit code nobody has used yet. */
async function freshCode(sql: Sql): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const c = String(randomInt(0, 10_000)).padStart(4, "0");
    const hit = (await sql`SELECT 1 FROM access_codes WHERE code = ${c}`) as unknown[];
    if (hit.length === 0) return c;
  }
  throw new Error("No free four-digit code is left");
}

export async function addCode(input: { code?: string; label?: string; keyId?: string | null }): Promise<CodeRowLite> {
  const sql = await db();
  const code = input.code?.trim() ? input.code.trim() : await freshCode(sql);
  if (!FOUR.test(code)) throw new BadInput("A code is exactly four digits.");
  if (input.keyId) await assertKey(sql, input.keyId);
  const id = newId();
  try {
    await sql`INSERT INTO access_codes (id, code, label, key_id) VALUES (${id}, ${code}, ${(input.label ?? "").slice(0, 60)}, ${input.keyId ?? null})`;
  } catch {
    throw new BadInput("That code is already in use.");
  }
  return { id, code };
}
type CodeRowLite = { id: string; code: string };

export class BadInput extends Error {}

async function assertKey(sql: Sql, keyId: string) {
  const k = (await sql`SELECT 1 FROM tiingo_keys WHERE id = ${keyId}`) as unknown[];
  if (!k.length) throw new BadInput("That Tiingo key doesn't exist.");
}

export async function updateCode(id: string, patch: { enabled?: boolean; label?: string; keyId?: string | null; code?: string }): Promise<void> {
  const sql = await db();
  if (patch.enabled !== undefined) await sql`UPDATE access_codes SET enabled = ${patch.enabled} WHERE id = ${id}`;
  if (patch.label !== undefined) await sql`UPDATE access_codes SET label = ${patch.label.slice(0, 60)} WHERE id = ${id}`;
  if (patch.keyId !== undefined) {
    if (patch.keyId) await assertKey(sql, patch.keyId);
    await sql`UPDATE access_codes SET key_id = ${patch.keyId} WHERE id = ${id}`;
  }
  if (patch.code !== undefined) {
    if (!FOUR.test(patch.code)) throw new BadInput("A code is exactly four digits.");
    try {
      await sql`UPDATE access_codes SET code = ${patch.code} WHERE id = ${id}`;
    } catch {
      throw new BadInput("That code is already in use.");
    }
  }
  drop(id);
}

export async function removeCode(id: string): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM access_codes WHERE id = ${id}`;
  drop(id);
}

/* ------------------------------ checking a visitor ------------------------------ */

/** The secret that signs access cookies. Only this server knows it. */
const signingSecret = () => (process.env.ADMIN_PASSWORD ?? process.env.TIINGO_API_KEY ?? "").trim();
const sign = (id: string, code: string) => createHmac("sha256", signingSecret()).update(`replay-code:${id}:${code}`).digest("hex");

interface Live {
  code: string;
  enabled: boolean;
  keySecret: string | null;
  at: number;
}
const cache = new Map<string, Live>();
const TTL_MS = 20_000;
function drop(id: string) {
  cache.delete(id);
}

async function liveCode(id: string, now: number): Promise<Live | null> {
  const hit = cache.get(id);
  if (hit && now - hit.at < TTL_MS) return hit;
  const sql = await db();
  const rows = (await sql`SELECT c.code, c.enabled, k.secret AS key_secret FROM access_codes c LEFT JOIN tiingo_keys k ON k.id = c.key_id WHERE c.id = ${id}`) as { code: string; enabled: boolean; key_secret: string | null }[];
  const r = rows[0];
  if (!r) {
    cache.delete(id);
    return null;
  }
  const live: Live = { code: r.code, enabled: r.enabled, keySecret: r.key_secret, at: now };
  cache.set(id, live);
  return live;
}

/** Whether there is any code to enter: the environment's, or one the admin has added and left on. */
export async function anyCodeConfigured(): Promise<boolean> {
  if (accessConfigured()) return true;
  if (!signingSecret()) return false;
  try {
    const sql = await db();
    return ((await sql`SELECT 1 FROM access_codes WHERE enabled LIMIT 1`) as unknown[]).length > 0;
  } catch {
    return false;
  }
}

export interface Match {
  id: string;
  cookie: string;
}

/** The cookie to hand out for a typed code, or null when it is wrong or switched off. */
export async function matchCode(typed: unknown): Promise<Match | null> {
  if (typeof typed !== "string" || !FOUR.test(typed)) return null;
  if (signingSecret()) {
    try {
      const sql = await db();
      const rows = (await sql`SELECT id FROM access_codes WHERE code = ${typed} AND enabled`) as { id: string }[];
      if (rows[0]) {
        const id = rows[0].id;
        await sql`UPDATE access_codes SET uses = uses + 1, last_used_at = now() WHERE id = ${id}`;
        return { id, cookie: `${id}.${sign(id, typed)}` };
      }
    } catch {
      /* no database: fall through to the environment's code */
    }
  }
  if (checkCode(typed)) return { id: "env", cookie: `env.${accessToken()}` };
  return null;
}

export type Grant = { source: "env" } | { source: "code"; id: string; key: string | null };

/** What this request is allowed: nothing (null), or a grant naming which Tiingo key to use. */
export async function grantFor(request: Request, now: number = Date.now()): Promise<Grant | null> {
  const v = cookieValue(request.headers.get("cookie"), ACCESS_COOKIE);
  if (!v) return null;
  const dot = v.indexOf(".");
  if (dot < 1) return null;
  const id = v.slice(0, dot);
  const sig = v.slice(dot + 1);
  if (id === "env") return accessConfigured() && same(sig, accessToken()) ? { source: "env" } : null;
  if (!signingSecret()) return null;
  try {
    const live = await liveCode(id, now);
    if (!live || !live.enabled || !same(sig, sign(id, live.code))) return null;
    return { source: "code", id, key: live.keySecret ? decrypt(live.keySecret) : null };
  } catch {
    return null;
  }
}

/** The Tiingo key this request may use, or undefined. */
export async function tiingoKeyFor(request: Request): Promise<string | undefined> {
  const g = await grantFor(request);
  if (!g) return undefined;
  const env = (process.env.TIINGO_API_KEY ?? "").trim();
  if (g.source === "code") return g.key ?? (env || undefined);
  return env || undefined;
}
