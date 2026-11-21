import { fetchRetry, NetError, realSleep, type Fetch, type Sleep } from "./net.ts";
import type { HeliusTx } from "./trades.ts";

/**
 * A wallet's transaction history from Helius, newest first, a page of 100 at a time.
 *
 * It asks for everything, not just swaps. Helius's own swap label misses trades (one test wallet had 4 real buys labelled as
 * plain SOL transfers), and a missed sell is a missed fumble. The parser sorts out which transactions were trades, so the cost
 * of this choice is only more pages: a typical wallet is mostly noise.
 */

const PAGE = 100;
/** Solana addresses are base58, 32 to 44 characters. Checked so nothing odd reaches the URL. */
export const isWalletAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

export interface HistoryOptions {
  apiKey: string;
  /** At most this many pages (calls). The result says whether that cut the history short. */
  maxPages?: number;
  /** Stop once a page reaches back to this time (seconds). */
  sinceTime?: number;
  fetchImpl?: Fetch;
  sleep?: Sleep;
}

export interface History {
  txs: HeliusTx[];
  pages: number;
  /** True when the whole history (or everything back to `sinceTime`) was read; false when `maxPages` stopped it first. */
  complete: boolean;
  /** Time of the oldest transaction read, or null when there were none. */
  oldest: number | null;
}

export async function fetchHistory(wallet: string, opts: HistoryOptions): Promise<History> {
  if (!isWalletAddress(wallet)) throw new Error("not a Solana wallet address");
  const fetchImpl: Fetch = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const sleep = opts.sleep ?? realSleep;
  const maxPages = opts.maxPages ?? 5;
  const txs: HeliusTx[] = [];
  let before = "";
  let pages = 0;
  let complete = false;

  while (pages < maxPages) {
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${encodeURIComponent(opts.apiKey)}&limit=${PAGE}${before ? `&before=${before}` : ""}`;
    const res = await fetchRetry(fetchImpl, url, undefined, { sleep });
    pages++;
    if (!res.ok) throw new NetError(res.status, "api.helius.xyz");
    const page = (await res.json()) as unknown;
    if (!Array.isArray(page)) throw new Error("Helius answered with something other than a list of transactions");
    txs.push(...(page as HeliusTx[]));
    const oldest = page.length ? (page[page.length - 1] as HeliusTx).timestamp : null;
    if (page.length < PAGE || (opts.sinceTime !== undefined && oldest !== null && oldest <= opts.sinceTime)) {
      complete = true;
      break;
    }
    before = (page[page.length - 1] as HeliusTx).signature;
    await sleep(150);
  }
  return { txs, pages, complete, oldest: txs.length ? txs[txs.length - 1].timestamp : null };
}
