import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_HITS, parseSearch, type DexSearchPair } from "../src/lib/tokenSearch.ts";

const ETH = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
const SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ADA = "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc928434894e4d4b52";

const pair = (over: Partial<DexSearchPair> & { addr?: string } = {}): DexSearchPair => ({
  chainId: "ethereum",
  baseToken: { address: over.addr ?? ETH, name: "Pepe", symbol: "PEPE" },
  priceUsd: "0.000004",
  liquidity: { usd: 10_000 },
  volume: { h24: 100 },
  ...over,
});

test("pools of one token are grouped and their liquidity summed", () => {
  const hits = parseSearch([pair(), pair({ liquidity: { usd: 90_000 }, priceUsd: "0.000005", info: { imageUrl: "https://cdn.example/l.png" } }), pair({ addr: ETH.toLowerCase() })]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].liquidityUsd, 110_000);
  assert.equal(hits[0].volume24h, 300);
  assert.equal(hits[0].priceUsd, 0.000005, "price from the deepest pool");
  assert.equal(hits[0].logo, "https://cdn.example/l.png");
});

test("unsupported chains, bad addresses and dust pools are dropped; best liquidity first", () => {
  const hits = parseSearch([
    pair({ chainId: "tron" }),
    pair({ chainId: "xrpl" }),
    pair({ addr: "0x123" }),
    pair({ chainId: "solana", addr: SOL, liquidity: { usd: 400 } }),
    pair({ chainId: "solana", addr: SOL, liquidity: { usd: 200 } }),
    pair({ chainId: "base", liquidity: { usd: 50 } }),
    pair({ chainId: "cardano", addr: ADA, liquidity: { usd: 5_500 } }),
    pair({ liquidity: { usd: 1_000_000 } }),
  ]);
  assert.deepEqual(hits.map((h) => h.chain), ["ethereum", "cardano", "solana"]);
  assert.equal(hits[2].liquidityUsd, 600, "two small pools can add up past the floor");
});

test("same address on two chains stays two tokens; solana is case sensitive", () => {
  const hits = parseSearch([pair({ chainId: "ethereum" }), pair({ chainId: "base" }), pair({ chainId: "solana", addr: SOL }), pair({ chainId: "solana", addr: SOL.toLowerCase() })]);
  assert.equal(hits.filter((h) => h.address.toLowerCase() === ETH.toLowerCase()).length, 2);
  assert.equal(hits.filter((h) => h.chain === "solana").length, 2, "mints differing only in case are different tokens");
});

test("results are capped, text is cleaned, insecure logos dropped", () => {
  const many = Array.from({ length: 40 }, (_, i) => pair({ addr: `0x${i.toString(16).padStart(40, "0")}`, liquidity: { usd: 1_000 + i } }));
  assert.equal(parseSearch(many).length, MAX_HITS);
  const [h] = parseSearch([{ ...pair(), baseToken: { address: ETH, name: "  Pepe\n\tCoin ", symbol: "PEPE" }, info: { imageUrl: "http://insecure.example/x.png" } }]);
  assert.equal(h.name, "Pepe Coin");
  assert.equal(h.logo, null);
  assert.deepEqual(parseSearch(null), []);
});

test("with a query, name and ticker matches come first and unrelated pool matches are dropped", () => {
  const mk = (addr: string, name: string, symbol: string, liq: number): DexSearchPair => ({ chainId: "solana", baseToken: { address: addr, name, symbol }, liquidity: { usd: liq } });
  const A = "So11111111111111111111111111111111111111112";
  const B = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const C = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
  const pairs = [mk(A, "Audiera", "BEAT", 91_000_000), mk(B, "My NMKR Fork", "FORK", 800_000), mk(C, "NMKR", "NMKR", 5_000)];
  assert.deepEqual(parseSearch(pairs, "nmkr").map((h) => h.symbol), ["NMKR", "FORK"], "exact first, contains second, unrelated dropped");
  assert.equal(parseSearch(pairs, "").length, 3, "no query keeps everything");
  assert.equal(parseSearch(pairs, B).length, 3, "an address query skips name filtering");
});
