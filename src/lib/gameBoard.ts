import { connectDb } from "./db.ts";
import { hashSecret } from "./share.ts";

/**
 * The Tony Stonk Survival board: who has claimed which name, and everyone's best run.
 *
 * A name is claimed with a secret token that the browser makes and keeps. Only a hash of it is stored, so a name can't be taken over
 * by someone who doesn't have the token. The game runs in the player's browser, so a score is only checked for being plausible (it
 * can't be higher than the run's length allows); this is a friendly board, not a tournament.
 */

export const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const RESERVED = new Set(["admin", "administrator", "replay", "tony", "tonystonk", "moderator", "staff", "support", "system", "root", "null"]);

export function validUsername(name: string): boolean {
  return USERNAME_RE.test(name) && !RESERVED.has(name.toLowerCase());
}
export const validToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{32,64}$/.test(t);

/** The fastest a run can go: pixels a second at full speed and 10x leverage, used to reject a score the run's own length could not have earned. */
const MAX_SPEED = 1900;
export const MAX_SCORE = 200_000;

/**
 * Is this score believable for a run of this length? A run covers at most MAX_SPEED pixels a second and a point is ten pixels (plus
 * five a coin, which are not more than one in every 120 pixels), so a score can't beat what the time allows.
 */
export function plausibleScore(score: number, durationMs: number): boolean {
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return false;
  if (!Number.isFinite(durationMs) || durationMs < 0) return false;
  const px = (durationMs / 1000) * MAX_SPEED + 400;
  const best = px / 10 + (px / 120) * 5;
  return score <= best;
}

export interface BoardEntry {
  username: string;
  score: number;
  asset: string;
  reached: string;
}

let ready: Promise<boolean> | null = null;

/** Opens the database and makes the tables on first use. Resolves false when there is no database. */
function tables(): Promise<boolean> {
  ready ??= (async () => {
    const sql = connectDb();
    if (!sql) return false;
    await sql`CREATE TABLE IF NOT EXISTS game_players (username_key text PRIMARY KEY, username text NOT NULL, token_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS game_scores (id bigserial PRIMARY KEY, username_key text NOT NULL, username text NOT NULL, score integer NOT NULL, asset text NOT NULL DEFAULT '', reached text NOT NULL DEFAULT '', duration_ms integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS game_scores_best ON game_scores (username_key, score DESC)`;
    return true;
  })().catch(() => {
    ready = null;
    return false;
  });
  return ready;
}

export type Claim = "ok" | "taken" | "offline";

/** Claims a name for a token: new names are saved, a returning player (same token) gets "ok", someone else's name is "taken". */
export async function claimName(username: string, token: string): Promise<Claim> {
  if (!(await tables())) return "offline";
  const sql = connectDb();
  if (!sql) return "offline";
  const key = username.toLowerCase();
  const hash = hashSecret(token);
  const rows = (await sql`SELECT token_hash FROM game_players WHERE username_key = ${key}`) as { token_hash: string }[];
  if (rows.length === 0) {
    await sql`INSERT INTO game_players (username_key, username, token_hash) VALUES (${key}, ${username}, ${hash}) ON CONFLICT (username_key) DO NOTHING`;
    const again = (await sql`SELECT token_hash FROM game_players WHERE username_key = ${key}`) as { token_hash: string }[];
    return again[0]?.token_hash === hash ? "ok" : "taken";
  }
  return rows[0].token_hash === hash ? "ok" : "taken";
}

/** Saves a run and says where it ranks: the player's best placing among everyone's best. */
export async function saveScore(o: { username: string; token: string; score: number; durationMs: number; asset: string; reached: string }): Promise<{ ok: true; rank: number; best: number } | { ok: false; reason: "offline" | "forbidden" }> {
  if (!(await tables())) return { ok: false, reason: "offline" };
  const sql = connectDb();
  if (!sql) return { ok: false, reason: "offline" };
  if ((await claimName(o.username, o.token)) !== "ok") return { ok: false, reason: "forbidden" };
  const key = o.username.toLowerCase();
  await sql`INSERT INTO game_scores (username_key, username, score, asset, reached, duration_ms) VALUES (${key}, ${o.username}, ${o.score}, ${o.asset.slice(0, 40)}, ${o.reached.slice(0, 24)}, ${Math.round(o.durationMs)})`;
  const best = ((await sql`SELECT MAX(score)::int AS best FROM game_scores WHERE username_key = ${key}`) as { best: number }[])[0]?.best ?? o.score;
  const ahead = ((await sql`SELECT COUNT(*)::int AS n FROM (SELECT username_key, MAX(score) AS b FROM game_scores GROUP BY username_key) t WHERE b > ${best}`) as { n: number }[])[0]?.n ?? 0;
  return { ok: true, rank: ahead + 1, best };
}

/** Everyone's best run, highest first. */
export async function leaderboard(limit = 20): Promise<BoardEntry[] | null> {
  if (!(await tables())) return null;
  const sql = connectDb();
  if (!sql) return null;
  const rows = (await sql`
    SELECT username, score, asset, reached FROM (
      SELECT DISTINCT ON (username_key) username, score, asset, reached, created_at FROM game_scores ORDER BY username_key, score DESC, created_at ASC
    ) t ORDER BY score DESC, created_at ASC LIMIT ${limit}`) as BoardEntry[];
  return rows.map((r) => ({ username: r.username, score: Number(r.score), asset: r.asset, reached: r.reached }));
}
