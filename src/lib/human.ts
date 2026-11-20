import { createHmac } from "node:crypto";
import { cookieValue, same } from "./access.ts";

/**
 * An invisible "are you a person" check for anonymous visitors, using Cloudflare Turnstile. It stays out of the way: most people
 * never see anything. A pass sets a signed cookie that lasts 12 hours, so the check is not repeated on every run. Off unless both
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set.
 */

export const HUMAN_COOKIE = "replay-human";
export const HUMAN_MAX_AGE = 12 * 60 * 60;

const secret = () => (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
export const humanRequired = (): boolean => secret().length > 0 && (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim().length > 0;

const sign = (exp: number) => createHmac("sha256", secret()).update(`replay-human:${exp}`).digest("hex");

export const humanToken = (now: number = Date.now()): string => {
  const exp = Math.floor(now / 1000) + HUMAN_MAX_AGE;
  return `${exp}.${sign(exp)}`;
};

/** Whether this request carries a valid, unexpired pass. */
export function isHuman(request: Request, now: number = Date.now()): boolean {
  if (!humanRequired()) return true;
  const v = cookieValue(request.headers.get("cookie"), HUMAN_COOKIE);
  if (!v) return false;
  const [expText, sig] = v.split(".");
  const exp = Number(expText);
  return Number.isInteger(exp) && exp > now / 1000 && !!sig && same(sig, sign(exp));
}

/** Asks Cloudflare whether the token the page got is real. */
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!humanRequired() || !token || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret: secret(), response: token });
    if (ip && ip !== "unknown") form.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
    const j = (await res.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}
