import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Owner-granted access to the site's own Tiingo key. The owner sets ACCESS_CODE (four digits) and TIINGO_API_KEY in the
 * environment. Someone who enters the code gets a signed cookie in their browser, and while it is there their stock lookups
 * may use the owner's key. The key itself never leaves the server, and the cookie stops working if the code or key changes.
 */

export const ACCESS_COOKIE = "replay-access";
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export { MAX_AGE_SECONDS as ACCESS_MAX_AGE };

const code = () => (process.env.ACCESS_CODE ?? "").trim();
const tiingo = () => (process.env.TIINGO_API_KEY ?? "").trim();

/** True when both the code (exactly four digits) and the key are set, so there is something to unlock. */
export const accessConfigured = (): boolean => /^\d{4}$/.test(code()) && tiingo().length > 0;

/** What the cookie holds: a signature that only this server (with this code and key) can produce. */
export function accessToken(): string {
  return createHmac("sha256", tiingo()).update(`replay-access:${code()}`).digest("hex");
}

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Whether the typed code is the right one. Compared in constant time. */
export const checkCode = (typed: unknown): boolean => accessConfigured() && typeof typed === "string" && /^\d{4}$/.test(typed) && same(typed, code());

function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Whether this request came from a browser that entered the code. */
export function hasAccess(request: Request): boolean {
  if (!accessConfigured()) return false;
  const v = cookieValue(request.headers.get("cookie"), ACCESS_COOKIE);
  return v !== null && same(v, accessToken());
}

/** The owner's Tiingo key, for a request that has access; otherwise undefined. */
export const ownerTiingoKey = (request: Request): string | undefined => (hasAccess(request) ? tiingo() : undefined);
