import { connectDb } from "./db.ts";
import { hashSecret, newShareId, type SharePayload } from "./share.ts";

/** Saves per client per hour. Keeps a script from filling the database. */
export const SAVES_PER_HOUR = 20;

type Sql = ReturnType<typeof connect>;

export class ShareUnavailable extends Error {}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new ShareUnavailable("Sharing is not set up. Add DATABASE_URL (a Neon Postgres connection string) to the environment.");
  return connectDb(url)!;
}

let ready: Promise<void> | null = null;

/** Creates the table on first use, so there is no separate migration step. */
function ensureTable(sql: Sql): Promise<void> {
  ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS shares (
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      payload jsonb NOT NULL,
      delete_hash text NOT NULL,
      ip_hash text NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS shares_ip_created_idx ON shares (ip_hash, created_at)`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export type SaveResult = { id: string } | "rate-limited";

export async function saveShare(payload: SharePayload, deleteToken: string, client: string): Promise<SaveResult> {
  const sql = connect();
  await ensureTable(sql);
  const ipHash = hashSecret(`ip:${client}`);

  const recent = (await sql`SELECT count(*)::int AS n FROM shares WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour'`) as { n: number }[];
  if ((recent[0]?.n ?? 0) >= SAVES_PER_HOUR) return "rate-limited";

  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newShareId();
    const rows = (await sql`
      INSERT INTO shares (id, payload, delete_hash, ip_hash)
      VALUES (${id}, ${JSON.stringify(payload)}::jsonb, ${hashSecret(deleteToken)}, ${ipHash})
      ON CONFLICT (id) DO NOTHING
      RETURNING id`) as { id: string }[];
    if (rows.length) return { id };
  }
  throw new Error("Could not allocate a share id");
}

export async function getShare(id: string): Promise<SharePayload | null> {
  const sql = connect();
  await ensureTable(sql);
  const rows = (await sql`SELECT payload FROM shares WHERE id = ${id}`) as { payload: SharePayload }[];
  return rows[0]?.payload ?? null;
}

/** True when a share with this id and delete token existed and is now gone. */
export async function deleteShare(id: string, deleteToken: string): Promise<boolean> {
  const sql = connect();
  await ensureTable(sql);
  const rows = (await sql`DELETE FROM shares WHERE id = ${id} AND delete_hash = ${hashSecret(deleteToken)} RETURNING id`) as { id: string }[];
  return rows.length > 0;
}
