import { fetchRetry, NetError, realSleep, type Fetch, type Sleep } from "./net.ts";
import type { HeliusTx } from "./trades.ts";

/**
 * A wallet's transaction history from Helius, newest first, a page of 100 at a time.
 *
 * Fetched unfiltered. Helius's own swap label misses trades (one test wallet had 4 real buys labelled as plain SOL transfers), and a
 * missed sell is a missed fumble. The obvious alternative, fetching SWAP and TRANSFER as two filtered lists, was measured and is
 * worse: a filtered page takes about 10 seconds and returns only a handful of transactions, while an unfiltered page takes about a
 * second and returns 100. On the test wallet ten unfiltered calls took 9 seconds and reached back 14 hours (most of it pump.fun
 * noise the parser discards); ten filtered calls took 91 seconds and reached back 36. Per hour of history the unfiltered way is
 * about four times faster, which is what a person waiting on a scan feels. `types` is kept for trying it again.
 *
 * A list only ends on an empty page. A page with fewer than 100 results does NOT mean the history is over: Helius searches a window
 * of the wallet's signatures and returns what matches, so filtered pages come back sparse (25 swaps, then 11 more, then none, on
 * the test wallet). Stopping at the first short page silently dropped older trades.
 */

const PAGE = 100;
/** Solana addresses are base58, 32 to 44 characters. Checked so nothing odd reaches the URL. */
export const isWalletAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

export interface HistoryOptions {
  apiKey: string;
  /** Helius transaction types to fetch, each as its own list. Default none: everything, unfiltered (see above for why). */
  types?: string[];
  /** At most this many pages (calls) for each type, counting the empty page that ends a list. The result says whether that cut the history short. */
  maxPages?: number;
  /** Stop a type once a page reaches back to this time (seconds). */
  sinceTime?: number;
  /** Stop reading once this many milliseconds have passed. What was read is kept, and the history is reported incomplete. */
  maxMs?: number;
  now?: () => number;
  fetchImpl?: Fetch;
  sleep?: Sleep;
}

export interface History {
  txs: HeliusTx[];
  /** Calls made, all types together. */
  pages: number;
  /**
   * True when the whole history (or everything back to `sinceTime`) was read. False when a page cap stopped some list first: then
   * `txs` holds only what every list covers, back to `oldest`, so a sell and the buys before it are never half seen.
   */
  complete: boolean;
  /** Time of the oldest transaction kept, or null when there were none. */
  oldest: number | null;
}

interface TypeRead {
  txs: HeliusTx[];
  pages: number;
  complete: boolean;
}

async function readType(wallet: string, type: string, opts: HistoryOptions, fetchImpl: Fetch, sleep: Sleep, outOfTime: () => boolean): Promise<TypeRead> {
  const maxPages = opts.maxPages ?? 30;
  const txs: HeliusTx[] = [];
  let before = "";
  let pages = 0;
  let complete = false;
  while (pages < maxPages && !outOfTime()) {
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${encodeURIComponent(opts.apiKey)}&limit=${PAGE}${type ? `&type=${type}` : ""}${before ? `&before=${before}` : ""}`;
    const res = await fetchRetry(fetchImpl, url, undefined, { sleep });
    pages++;
    if (!res.ok) throw new NetError(res.status, "api.helius.xyz");
    const page = (await res.json()) as unknown;
    if (!Array.isArray(page)) throw new Error("Helius answered with something other than a list of transactions");
    txs.push(...(page as HeliusTx[]));
    const last = page.length ? (page[page.length - 1] as HeliusTx) : null;
    if (page.length === 0 || (opts.sinceTime !== undefined && last !== null && last.timestamp <= opts.sinceTime)) {
      complete = true;
      break;
    }
    before = last!.signature;
    await sleep(150);
  }
  return { txs, pages, complete };
}

export async function fetchHistory(wallet: string, opts: HistoryOptions): Promise<History> {
  if (!isWalletAddress(wallet)) throw new Error("not a Solana wallet address");
  const fetchImpl: Fetch = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const sleep = opts.sleep ?? realSleep;
  const types = opts.types ?? [];
  const now = opts.now ?? Date.now;
  const started = now();
  const outOfTime = () => opts.maxMs !== undefined && now() - started >= opts.maxMs;

  const reads: TypeRead[] = [];
  for (const type of types.length ? types : [""]) reads.push(await readType(wallet, type, opts, fetchImpl, sleep, outOfTime));

  // The same transaction can be in more than one list; it is kept once.
  const bySig = new Map<string, HeliusTx>();
  for (const r of reads) for (const t of r.txs) bySig.set(t.signature, t);
  let txs = [...bySig.values()].sort((a, b) => b.timestamp - a.timestamp);

  // A list that was cut short only vouches for the time since its oldest transaction. Anything older came from a list that went
  // further, and keeping it would show a sell without the buys before it.
  const cut = reads.filter((r) => !r.complete);
  const complete = cut.length === 0;
  if (!complete) {
    // A list never read at all vouches for nothing, so nothing is kept.
    const cutoff = Math.max(...cut.map((r) => (r.txs.length ? r.txs[r.txs.length - 1].timestamp : Infinity)));
    txs = txs.filter((t) => t.timestamp >= cutoff);
  }
  return { txs, pages: reads.reduce((n, r) => n + r.pages, 0), complete, oldest: txs.length ? txs[txs.length - 1].timestamp : null };
}
