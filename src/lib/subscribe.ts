import { connectDb } from "./db.ts";

/** A pragmatic email check: one @, something on both sides, a dot in the domain, no spaces. Real proof is the first email. */
export function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** Saves an address to the update list. Saving the same address twice is fine. Returns false when there is no database. */
export async function saveSubscriber(email: string): Promise<boolean> {
  const sql = connectDb();
  if (!sql) return false;
  await sql`CREATE TABLE IF NOT EXISTS subscribers (email text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`INSERT INTO subscribers (email) VALUES (${email.trim().toLowerCase()}) ON CONFLICT (email) DO NOTHING`;
  return true;
}
