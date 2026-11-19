import { hashSecret } from "./share.ts";
import { hitRateLimit } from "./rateLimit.ts";

/**
 * Shared plumbing for the public /api/v1 routes: CORS, optional API keys, rate limits, and one error shape.
 *
 *   DCA_API_KEYS   comma-separated keys. If set, every v1 request must send one as
 *                  `Authorization: Bearer <key>` or `x-api-key: <key>`. If unset, the API is open.
 *   DCA_API_RATE_LIMIT_ANON / DCA_API_RATE_LIMIT_KEY   requests per minute (defaults 30 and 120)
 */

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
  "access-control-expose-headers": "x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, retry-after",
  "access-control-max-age": "86400",
};

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS, ...extra } });
}

export function apiError(status: number, code: string, message: string, fields?: Record<string, string>, extra: Record<string, string> = {}): Response {
  const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } };
  return json(status, body, extra);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function configuredKeys(): string[] {
  return (process.env.DCA_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
}

/** The key a request presented, if any. */
export function presentedKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-api-key")?.trim() || null;
}

/** Constant-time-ish comparison so a wrong key reveals nothing about a right one. */
function sameKey(a: string, b: string): boolean {
  const x = hashSecret(a);
  const y = hashSecret(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const intEnv = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Runs `handler` behind auth and rate limiting. Returns the handler's Response with CORS and rate-limit headers added,
 * or an error response if the caller is not allowed in.
 */
export async function guarded(request: Request, handler: () => Promise<Response>): Promise<Response> {
  const keys = configuredKeys();
  const key = presentedKey(request);
  const valid = key !== null && keys.some((k) => sameKey(k, key));
  if (keys.length > 0 && !valid) {
    return apiError(401, key ? "invalid_api_key" : "api_key_required", key ? "That API key is not valid." : "This API needs a key. Send it as `Authorization: Bearer <key>` or `x-api-key: <key>`.", undefined, { "www-authenticate": 'Bearer realm="dripcast"' });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const who = valid ? `key:${hashSecret(key as string).slice(0, 16)}` : `ip:${hashSecret(ip).slice(0, 16)}`;
  const limit = valid ? intEnv("DCA_API_RATE_LIMIT_KEY", 120) : intEnv("DCA_API_RATE_LIMIT_ANON", 30);
  const rate = await hitRateLimit(`v1:${who}`, limit, 60);
  const rateHeaders = { "x-ratelimit-limit": String(rate.limit), "x-ratelimit-remaining": String(rate.remaining), "x-ratelimit-reset": String(rate.resetSeconds) };
  if (!rate.ok) {
    return apiError(429, "rate_limited", `Too many requests. Limit is ${rate.limit} per minute. Try again in ${rate.resetSeconds} seconds.`, undefined, { ...rateHeaders, "retry-after": String(rate.resetSeconds) });
  }

  const res = await handler();
  for (const [k, v] of Object.entries(rateHeaders)) res.headers.set(k, v);
  return res;
}
