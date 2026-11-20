import { createHmac } from "node:crypto";
import { cookieValue, same } from "./access.ts";

/**
 * The admin page is guarded by one password, ADMIN_PASSWORD (at least 8 characters), set in the environment. Signing in sets a
 * signed, expiring cookie that only this server can make. Not set up means nobody can sign in.
 */

export const ADMIN_COOKIE = "replay-admin";
export const ADMIN_MAX_AGE = 7 * 24 * 60 * 60;

const password = () => (process.env.ADMIN_PASSWORD ?? "").trim();
export const adminConfigured = (): boolean => password().length >= 8;

export const checkAdminPassword = (typed: unknown): boolean => adminConfigured() && typeof typed === "string" && same(typed, password());

const sign = (exp: number) => createHmac("sha256", password()).update(`replay-admin:${exp}`).digest("hex");

/** A cookie value good for ADMIN_MAX_AGE seconds from `now`. */
export const adminToken = (now: number = Date.now()): string => {
  const exp = Math.floor(now / 1000) + ADMIN_MAX_AGE;
  return `${exp}.${sign(exp)}`;
};

/** Whether this request carries a valid, unexpired admin cookie. */
export function isAdmin(request: Request, now: number = Date.now()): boolean {
  if (!adminConfigured()) return false;
  const v = cookieValue(request.headers.get("cookie"), ADMIN_COOKIE);
  if (!v) return false;
  const [expText, sig] = v.split(".");
  const exp = Number(expText);
  return Number.isInteger(exp) && exp > now / 1000 && !!sig && same(sig, sign(exp));
}
