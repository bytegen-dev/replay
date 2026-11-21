/**
 * The two things every call to a free-tier API needs: a minimum gap between calls, and a retry when the API says "slow down".
 * Both take their clock and fetch as arguments, so the tests can run them without a network or real waiting.
 */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** An error that never carries the request URL: some APIs take the key in the URL, and a key must not reach a log. */
export class NetError extends Error {
  status: number;
  constructor(status: number, host: string) {
    super(`${host} answered ${status}`);
    this.status = status;
  }
}

/**
 * Runs the jobs it is given one at a time, starting each at least `minGapMs` after the previous one started. One limiter per
 * API, shared by everything that calls it, so a burst of scans cannot exceed that API's limit.
 */
export function makeLimiter(minGapMs: number, sleep: Sleep = realSleep, now: () => number = Date.now) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;
  return function limited<T>(job: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = lastStart + minGapMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      return job();
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export interface RetryOptions {
  tries?: number;
  /** The first wait after a 429 or a server error; each retry waits one step longer. */
  baseMs?: number;
  sleep?: Sleep;
}

/** GET (or any request) that waits and tries again on 429 and 5xx, honouring Retry-After. Other statuses come straight back. */
export async function fetchRetry(fetchImpl: Fetch, url: string, init: RequestInit | undefined, opts: RetryOptions = {}): Promise<Response> {
  const tries = opts.tries ?? 5;
  const baseMs = opts.baseMs ?? 1500;
  const sleep = opts.sleep ?? realSleep;
  const host = new URL(url).host;
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch {
      // A dropped connection is treated like a busy server.
      await sleep(baseMs * (i + 1));
      continue;
    }
    if (res.status !== 429 && res.status < 500) return res;
    last = res;
    const after = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 20_000) : baseMs * (i + 1));
  }
  throw new NetError(last?.status ?? 0, host);
}
