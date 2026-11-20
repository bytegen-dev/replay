import { userFor } from "./accounts.ts";
import { grantFor } from "./accessStore.ts";
import { hitRateLimit } from "./rateLimit.ts";
import { hashSecret } from "./share.ts";

/**
 * How much one visitor can run on the home page. Three kinds of visitor, with different daily allowances:
 *  - anonymous: counted by network address, the smallest allowance, and the one that asks to sign in when it runs out;
 *  - signed in: counted by account, a larger allowance;
 *  - trusted: someone who entered an access code, who is let through with a high ceiling.
 * Every kind also has a per-minute ceiling, which is what stops a script hammering the page. All numbers can be set in the environment.
 */

export type Kind = "anonymous" | "user" | "trusted";
export interface Viewer {
  kind: Kind;
  /** Who the counters belong to: an address hash, an account id, or an access code id. */
  id: string;
}

const num = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const limitsFor = (kind: Kind) => ({
  day: kind === "anonymous" ? num("RUN_LIMIT_ANON_DAY", 20) : kind === "user" ? num("RUN_LIMIT_USER_DAY", 150) : num("RUN_LIMIT_TRUSTED_DAY", 1000),
  minute: kind === "anonymous" ? num("RUN_LIMIT_ANON_MINUTE", 10) : num("RUN_LIMIT_MINUTE", 30),
});

export const clientIp = (request: Request): string => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";

/** Who is asking. An access code makes someone trusted; an account (added with sign-in) makes them a user; anyone else is anonymous. */
export async function whoIs(request: Request): Promise<Viewer> {
  const grant = await grantFor(request).catch(() => null);
  if (grant) return { kind: "trusted", id: grant.source === "env" ? "env" : grant.id };
  const user = await userFor(request).catch(() => null);
  if (user) return { kind: "user", id: user.id };
  return { kind: "anonymous", id: hashSecret(`ip:${clientIp(request)}`).slice(0, 16) };
}

export type LimitCode = "minute" | "day";
export interface LimitResult {
  ok: boolean;
  kind: Kind;
  code?: LimitCode;
  /** The allowance that was hit, and the seconds until it comes back. */
  limit?: number;
  resetSeconds?: number;
  /** What is left of today's allowance, for the page to show. */
  remaining: number;
}

/** Counts one run against the visitor. Each run counts once against the minute ceiling and once against the day's allowance. */
export async function countRun(viewer: Viewer): Promise<LimitResult> {
  const lim = limitsFor(viewer.kind);
  const minute = await hitRateLimit(`run:m:${viewer.kind}:${viewer.id}`, lim.minute, 60);
  if (!minute.ok) return { ok: false, kind: viewer.kind, code: "minute", limit: lim.minute, resetSeconds: minute.resetSeconds, remaining: 0 };
  const day = await hitRateLimit(`run:d:${viewer.kind}:${viewer.id}`, lim.day, 86_400);
  if (!day.ok) return { ok: false, kind: viewer.kind, code: "day", limit: lim.day, resetSeconds: day.resetSeconds, remaining: 0 };
  return { ok: true, kind: viewer.kind, remaining: day.remaining };
}

/** The message and answer for a refused run. */
export function limitMessage(r: LimitResult): string {
  const wait = r.resetSeconds ?? 60;
  const when = wait >= 3600 ? `${Math.ceil(wait / 3600)} hours` : wait >= 120 ? `${Math.ceil(wait / 60)} minutes` : "a minute";
  if (r.code === "minute") return `You're going a bit fast. Wait ${when} and try again.`;
  if (r.kind === "anonymous") return `You've used today's ${r.limit} free checks. Sign in to keep going, or come back in ${when}.`;
  return `You've reached today's limit of ${r.limit} checks. It comes back in ${when}.`;
}
