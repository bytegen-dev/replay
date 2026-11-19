import { neon } from "@neondatabase/serverless";

/**
 * A fixed-window request counter. With DATABASE_URL it lives in the same Neon database as everything else, so the
 * limit holds across Vercel's many server instances. Without it (or if the database hiccups) each instance counts
 * for itself, which is weaker but never blocks anyone by mistake.
 */

export interface RateResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

const memory = new Map<string, { window: number; n: number }>();

function connect() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}
type Sql = NonNullable<ReturnType<typeof connect>>;

let ready: Promise<void> | null = null;
function ensureTable(sql: Sql): Promise<void> {
  ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS rate_limits (
      key text NOT NULL,
      win bigint NOT NULL,
      n int NOT NULL DEFAULT 0,
      PRIMARY KEY (key, win)
    )`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

function countInMemory(key: string, win: number): number {
  const cur = memory.get(key);
  const n = cur && cur.window === win ? cur.n + 1 : 1;
  memory.set(key, { window: win, n });
  if (memory.size > 5000) for (const [k, v] of memory) if (v.window < win) memory.delete(k);
  return n;
}

/** Counts one request against `key` and says whether it is still within `limit` per `windowSeconds`. */
export async function hitRateLimit(key: string, limit: number, windowSeconds = 60, now: number = Date.now()): Promise<RateResult> {
  const win = Math.floor(now / 1000 / windowSeconds);
  let n: number;
  try {
    const sql = connect();
    if (!sql) throw new Error("no database");
    await ensureTable(sql);
    const rows = (await sql`INSERT INTO rate_limits (key, win, n) VALUES (${key}, ${win}, 1)
      ON CONFLICT (key, win) DO UPDATE SET n = rate_limits.n + 1 RETURNING n`) as { n: number }[];
    n = rows[0]?.n ?? 1;
    // Old windows are dead weight; sweep them now and then.
    if (Math.random() < 0.02) void sql`DELETE FROM rate_limits WHERE win < ${win - 2}`.catch(() => {});
  } catch {
    n = countInMemory(key, win);
  }
  return { ok: n <= limit, limit, remaining: Math.max(0, limit - n), resetSeconds: (win + 1) * windowSeconds - Math.floor(now / 1000) };
}

/** Test hook. */
export function clearRateLimitMemory(): void {
  memory.clear();
}
