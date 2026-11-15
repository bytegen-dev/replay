const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 4;

interface CacheEntry {
  at: number;
  value: unknown;
}
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds from a Retry-After header, if present and sane. */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const s = Number(h);
  return Number.isFinite(s) && s >= 0 ? Math.min(s * 1000, 20_000) : null;
}

/**
 * GET JSON with: 1h in-memory cache (keyed by URL, never by headers, so API keys
 * stay out of the key), de-duplication of concurrent identical calls, and
 * retry with exponential backoff on 429 / 5xx / network errors.
 * 404 is not retried and is thrown as HttpError(404).
 */
export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { accept: "application/json", ...headers },
          cache: "no-store",
          signal: AbortSignal.timeout(25_000),
        });
        if (res.ok) {
          const value = (await res.json()) as T;
          cache.set(url, { at: Date.now(), value });
          return value;
        }
        if (res.status === 429 || res.status >= 500) {
          lastErr = new HttpError(res.status, res.status === 429 ? "Rate limited by data provider" : `Provider error ${res.status}`);
          await sleep(retryAfterMs(res) ?? 1000 * 2 ** attempt);
          continue;
        }
        throw new HttpError(res.status, `Provider returned ${res.status}`);
      } catch (e) {
        if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
        lastErr = e;
        if (attempt < MAX_ATTEMPTS - 1) await sleep(1000 * 2 ** attempt);
      }
    }
    if (lastErr instanceof HttpError) throw lastErr;
    throw new HttpError(0, "Could not reach the data provider");
  })();

  inflight.set(url, run);
  try {
    return await run;
  } finally {
    inflight.delete(url);
  }
}
