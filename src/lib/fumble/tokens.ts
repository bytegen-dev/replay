import { isWalletAddress } from "./helius.ts";
import { fetchRetry, realSleep, type Fetch, type Sleep } from "./net.ts";

/**
 * A coin's name and ticker, from the chain itself through Helius (one call covers up to 100 coins). Unlike a market listing this works
 * for dead coins too, which are exactly the ones a wallet's worst trades tend to be in.
 *
 * Names and tickers are whatever the coin's creator typed, so they are cleaned before anything shows them: control and direction-
 * changing characters removed (they can reorder the text around them), whitespace collapsed, and the length capped.
 */

const BATCH = 100;
const MAX_SYMBOL = 12;
const MAX_NAME = 40;

export interface TokenInfo {
  symbol?: string;
  name?: string;
}

/** Code point ranges removed from names: control characters, the zero-width ones, and the left-to-right and right-to-left overrides and isolates. */
const UNSAFE: [number, number][] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
const safe = (ch: string) => {
  const cp = ch.codePointAt(0)!;
  return !UNSAFE.some(([from, to]) => cp >= from && cp <= to);
};

export function cleanText(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = Array.from(raw).filter(safe).join("").replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}\u2026` : s;
}

interface Asset {
  id?: string;
  content?: { metadata?: { name?: unknown; symbol?: unknown } };
  token_info?: { symbol?: unknown };
}

/** The coins in a getAssetBatch answer, by address. A coin the chain has no metadata for (a null in the list) simply has no entry. */
export function parseAssets(json: unknown): Map<string, TokenInfo> {
  const out = new Map<string, TokenInfo>();
  const list = (json as { result?: unknown } | null)?.result;
  if (!Array.isArray(list)) return out;
  for (const a of list as (Asset | null)[]) {
    if (!a?.id) continue;
    const symbol = cleanText(a.content?.metadata?.symbol ?? a.token_info?.symbol, MAX_SYMBOL);
    const name = cleanText(a.content?.metadata?.name, MAX_NAME);
    if (symbol || name) out.set(a.id, { ...(symbol ? { symbol } : {}), ...(name ? { name } : {}) });
  }
  return out;
}

export interface TokenDeps {
  fetchImpl?: Fetch;
  sleep?: Sleep;
}

/**
 * Looks up a list of coins. A batch that fails is skipped, not fatal: the page then shows those coins by their address, which is
 * worse but never wrong.
 */
export function heliusTokens(apiKey: string, deps: TokenDeps = {}) {
  const fetchImpl: Fetch = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const sleep = deps.sleep ?? realSleep;
  return async (mints: string[]): Promise<Map<string, TokenInfo>> => {
    const valid = [...new Set(mints)].filter(isWalletAddress); // a coin's address is the same kind of string as a wallet's
    const out = new Map<string, TokenInfo>();
    for (let i = 0; i < valid.length; i += BATCH) {
      const ids = valid.slice(i, i + BATCH);
      try {
        const res = await fetchRetry(
          fetchImpl,
          `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAssetBatch", params: { ids } }) },
          { sleep, tries: 3 },
        );
        if (!res.ok) continue;
        for (const [mint, info] of parseAssets(await res.json())) out.set(mint, info);
      } catch {
        /* this batch is skipped */
      }
    }
    return out;
  };
}
