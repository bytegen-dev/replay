import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTokenInfo, cleanText, httpsUrl, matchingPairs, type CgCoin, type DexPair } from "../src/lib/tokenInfo.ts";

const ADDR = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
const pair = (over: Partial<DexPair> = {}): DexPair => ({
  chainId: "ethereum",
  dexId: "uniswap",
  url: "https://dexscreener.com/ethereum/0xabc",
  baseToken: { address: ADDR.toLowerCase(), name: "Pepe", symbol: "PEPE" },
  priceUsd: "0.000004",
  liquidity: { usd: 1000 },
  volume: { h24: 500 },
  priceChange: { h24: 1.5 },
  ...over,
});
const cg: CgCoin = {
  id: "pepe",
  symbol: "pepe",
  name: "Pepe",
  description: { en: "A <a href=\"x\">frog</a> &amp; friends" },
  image: { large: "https://coin-images.coingecko.com/pepe.png" },
  market_cap_rank: 30,
  links: { homepage: ["http://insecure.example", "https://pepe.vip"], twitter_screen_name: "pepecoineth", blockchain_site: ["https://etherscan.io/token/x", ""] },
  market_data: { current_price: { usd: 0.000003 }, market_cap: { usd: 1500 }, total_supply: 420, circulating_supply: 400, max_supply: null },
};

test("only https urls pass", () => {
  assert.equal(httpsUrl("https://a.example/x"), "https://a.example/x");
  for (const bad of ["http://a.example", "javascript:alert(1)", "data:text/html,x", "https://a b", "", null, 5]) assert.equal(httpsUrl(bad), null);
});

test("descriptions lose tags and entities and are capped on a word", () => {
  assert.equal(cleanText('A <a href="x">frog</a> &amp; friends'), "A frog & friends");
  const long = cleanText("word ".repeat(200), 100) ?? "";
  assert.ok(long.length <= 101 && long.endsWith("…"));
  assert.equal(cleanText("   "), null);
});

test("pairs match on chain and base token; solana is case sensitive, evm is not", () => {
  const mixed = [pair(), pair({ chainId: "base" }), pair({ baseToken: { address: "0xother" } })];
  assert.equal(matchingPairs(mixed, "ethereum", ADDR).length, 1);
  assert.equal(matchingPairs(mixed, "cardano", ADDR).length, 0);
  const sol = [pair({ chainId: "solana", baseToken: { address: "AbC" } })];
  assert.equal(matchingPairs(sol, "solana", "AbC").length, 1);
  assert.equal(matchingPairs(sol, "solana", "abc").length, 0);
});

test("merges both sources: coingecko identity and supply, dex price, liquidity and volume", () => {
  const info = buildTokenInfo(cg, [pair(), pair({ liquidity: { usd: 9000 }, volume: { h24: 100 }, priceUsd: "0.000005", info: { header: "https://cdn.example/banner.png", imageUrl: "https://cdn.example/logo.png", websites: [{ label: "Site", url: "https://pepe.vip" }], socials: [{ type: "telegram", url: "https://t.me/pepe" }] } })], "ethereum", ADDR);
  assert.ok(info);
  assert.equal(info.symbol, "PEPE");
  assert.equal(info.logo, "https://coin-images.coingecko.com/pepe.png");
  assert.equal(info.banner, "https://cdn.example/banner.png");
  assert.equal(info.priceUsd, 0.000005, "price comes from the deepest pool");
  assert.equal(info.liquidityUsd, 10000);
  assert.equal(info.volume24h, 600);
  assert.equal(info.poolCount, 2);
  assert.equal(info.marketCap, 1500);
  assert.equal(info.totalSupply, 420);
  assert.equal(info.maxSupply, null);
  assert.equal(info.description, "A frog & friends");
  const urls = info.links.map((l) => l.url);
  assert.ok(!urls.some((u) => u.startsWith("http://")), "no insecure links");
  assert.equal(urls.filter((u) => u === "https://pepe.vip").length, 1, "deduped");
  assert.ok(urls.includes("https://x.com/pepecoineth") && urls.includes("https://t.me/pepe"));
  assert.deepEqual(info.sources.map((s) => s.label), ["CoinGecko", "DexScreener"]);
});

test("missing sources leave fields null and explain why; nothing known returns null", () => {
  const dexOnly = buildTokenInfo(null, [pair()], "ethereum", ADDR);
  assert.ok(dexOnly);
  assert.equal(dexOnly.marketCap, null);
  assert.ok(dexOnly.notes.some((n) => /CoinGecko/.test(n)));

  const cardano = buildTokenInfo(cg, [], "cardano", "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489");
  assert.ok(cardano);
  assert.equal(cardano.liquidityUsd, null);
  assert.equal(cardano.volume24h, null);
  assert.ok(cardano.notes.some((n) => /Cardano/.test(n)));

  assert.equal(buildTokenInfo(null, [], "ethereum", ADDR), null);
  assert.equal(buildTokenInfo(null, [pair({ chainId: "base" })], "ethereum", ADDR), null);
});
