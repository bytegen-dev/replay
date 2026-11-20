import { createHash, randomBytes } from "node:crypto";
import { cookieValue } from "./access.ts";
import { connectDb } from "./db.ts";
import { validEmail } from "./subscribe.ts";

/**
 * Passwordless accounts. Someone types their email, gets a one-time link that is good for 15 minutes, and opening it signs them
 * in: a session cookie that lasts 30 days. There are no passwords to store, reset or leak. Only a hash of each link token and
 * each session id is kept, so a copy of the database can't sign anyone in.
 */

export const SESSION_COOKIE = "replay-session";
export const SESSION_DAYS = 30;
export const LINK_MINUTES = 15;

type Sql = NonNullable<ReturnType<typeof connectDb>>;
export class AccountsUnavailable extends Error {}

function connect(): Sql {
  const sql = connectDb();
  if (!sql) throw new AccountsUnavailable("Accounts need a database. Set DATABASE_URL.");
  return sql;
}

let ready: Promise<void> | null = null;
function ensureTables(sql: Sql): Promise<void> {
  ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz
    )`;
    await sql`CREATE TABLE IF NOT EXISTS login_links (
      token_hash text PRIMARY KEY,
      email text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )`;
    await sql`CREATE TABLE IF NOT EXISTS sessions (
      id_hash text PRIMARY KEY,
      user_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`;
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

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const newId = () => randomBytes(9).toString("base64url");

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Makes a one-time link token for an address and stores its hash. Returns the token to put in the email. */
export async function createLoginLink(email: string): Promise<string> {
  if (!validEmail(email)) throw new Error("Not an email address");
  const sql = await db();
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO login_links (token_hash, email, expires_at) VALUES (${sha(token)}, ${normalizeEmail(email)}, now() + make_interval(mins => ${LINK_MINUTES}))`;
  if (Math.random() < 0.05) void sql`DELETE FROM login_links WHERE expires_at < now() - interval '1 day'`.catch(() => {});
  return token;
}

export interface User {
  id: string;
  email: string;
}

/** Uses a link token once. Returns the session id to set as the cookie, or null if the link is wrong, used or old. */
export async function redeemLoginLink(token: string): Promise<{ session: string; user: User } | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const sql = await db();
  const rows = (await sql`UPDATE login_links SET used_at = now() WHERE token_hash = ${sha(token)} AND used_at IS NULL AND expires_at > now() RETURNING email`) as { email: string }[];
  const email = rows[0]?.email;
  if (!email) return null;
  const found = (await sql`INSERT INTO users (id, email, last_login_at) VALUES (${newId()}, ${email}, now())
    ON CONFLICT (email) DO UPDATE SET last_login_at = now() RETURNING id, email`) as { id: string; email: string }[];
  const user = found[0];
  const session = randomBytes(32).toString("base64url");
  await sql`INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (${sha(session)}, ${user.id}, now() + make_interval(days => ${SESSION_DAYS}))`;
  if (Math.random() < 0.05) void sql`DELETE FROM sessions WHERE expires_at < now()`.catch(() => {});
  return { session, user };
}

const cache = new Map<string, { at: number; user: User | null }>();
const TTL_MS = 30_000;

/** The signed-in person for this request, or null. */
export async function userFor(request: Request, now: number = Date.now()): Promise<User | null> {
  const v = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!v || !/^[A-Za-z0-9_-]{20,80}$/.test(v)) return null;
  const key = sha(v);
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.user;
  const sql = await db();
  const rows = (await sql`SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ${key} AND s.expires_at > now()`) as User[];
  const user = rows[0] ?? null;
  cache.set(key, { at: now, user });
  if (cache.size > 2000) cache.clear();
  return user;
}

export async function endSession(request: Request): Promise<void> {
  const v = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!v) return;
  cache.delete(sha(v));
  const sql = await db();
  await sql`DELETE FROM sessions WHERE id_hash = ${sha(v)}`;
}

/** Signs a person out of every device. */
export async function endAllSessions(userId: string): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
  cache.clear();
}

/* ------------------------------ the email ------------------------------ */

export const mailConfigured = (): boolean => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

/** Sends the sign-in link through Resend. Without RESEND_API_KEY and MAIL_FROM nothing is sent; the caller decides what to do. */
export async function sendLoginEmail(to: string, link: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject: "Your Replay sign-in link",
      text: `Open this link to sign in to Replay. It works once and expires in ${LINK_MINUTES} minutes.\n\n${link}\n\nIf you didn't ask for it, ignore this email.`,
      html: `<p>Open this link to sign in to Replay. It works once and expires in ${LINK_MINUTES} minutes.</p><p><a href="${link}">Sign in to Replay</a></p><p style="color:#666">If you didn't ask for it, ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}
