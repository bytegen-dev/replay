import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSearch, sortHits, type DexSearchPair, type TokenHit } from "../src/lib/tokenSearch.ts";

const ETH = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
const pair = (over: Partial<DexSearchPair> = {}): DexSearchPair => ({
  chainId: "ethereum",
  baseToken: { address: ETH, name: "Pepe", symbol: "PEPE" },
  liquidity: { usd: 10_000 },
  ...over,
});

test("market cap is the largest value across a token's pools, and null when missing", () => {
  const [a] = parseSearch([pair({ marketCap: 1_000 }), pair({ marketCap: 5_000 })]);
  assert.equal(a.marketCap, 5_000);
  const [b] = parseSearch([pair()]);
  assert.equal(b.marketCap, null);
});

const h = (symbol: string, marketCap: number | null, liquidityUsd: number, volume24h: number): TokenHit => ({
  chain: "ethereum",
  address: `0x${symbol}`,
  name: symbol,
  symbol,
  logo: null,
  priceUsd: null,
  marketCap,
  liquidityUsd,
  volume24h,
});

test("sortHits orders by the chosen key, puts missing values last, keeps server order for ties and best match", () => {
  const hits = [h("A", 100, 5, 50), h("B", null, 9, 10), h("C", 900, 1, 90), h("D", 100, 7, 10)];
  assert.deepEqual(sortHits(hits, "marketCap").map((x) => x.symbol), ["C", "A", "D", "B"], "A before D on a tie; B has no market cap, so last");
  assert.deepEqual(sortHits(hits, "liquidity").map((x) => x.symbol), ["B", "D", "A", "C"]);
  assert.deepEqual(sortHits(hits, "volume").map((x) => x.symbol), ["C", "A", "B", "D"], "B before D on a tie");
  assert.deepEqual(sortHits(hits, "relevance").map((x) => x.symbol), ["A", "B", "C", "D"]);
  assert.deepEqual(hits.map((x) => x.symbol), ["A", "B", "C", "D"], "the input is not mutated");
});

test("a missing market cap field (older cached response) sorts last instead of breaking the order", () => {
  const old = { ...h("OLD", 1, 1, 1) } as Partial<TokenHit>;
  delete old.marketCap;
  const hits = [old as TokenHit, h("NEW", 5, 1, 1)];
  assert.deepEqual(sortHits(hits, "marketCap").map((x) => x.symbol), ["NEW", "OLD"]);
});
