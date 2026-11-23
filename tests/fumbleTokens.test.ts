import assert from "node:assert/strict";
import { test } from "node:test";
import type { Fetch } from "../src/lib/fumble/net.ts";
import { cleanText, createNameBook, heliusTokens, parseAssets, type TokenInfo } from "../src/lib/fumble/tokens.ts";

const RLO = String.fromCharCode(0x202e); // right-to-left override
const ZWSP = String.fromCharCode(0x200b); // zero-width space
const LRI = String.fromCharCode(0x2066); // left-to-right isolate
const ELLIPSIS = String.fromCharCode(0x2026);
const WIN = "9msk9ehERMECbvsp3mvNabSXy2k7GNcrxJgdWfh7pump";
const GOOSE = "2fqw6uYRVDVd8vDEGfCNYxmBiGanYCT5u2BtXz8vCnN2";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const fake = (i: number) => `${ALPHABET[i % 58]}${ALPHABET[Math.floor(i / 58) % 58]}${"A".repeat(42)}`;
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const asset = (id: string, symbol: unknown, name: unknown) => ({ id, interface: "FungibleToken", content: { metadata: { name, symbol } }, token_info: { symbol } });

test("names and tickers are read from the real answer, and a coin the chain has nothing for (a null) has no entry", () => {
  const info = parseAssets({ result: [asset(WIN, "win", "it only takes one win"), asset(GOOSE, "GOOSE", "golden goose"), null] });
  assert.equal(info.size, 2);
  assert.deepEqual(info.get(WIN), { symbol: "win", name: "it only takes one win" });
  assert.deepEqual(info.get(GOOSE), { symbol: "GOOSE", name: "golden goose" });
});

test("the ticker falls back to the token info when the metadata has none, and rows with neither are skipped", () => {
  const info = parseAssets({ result: [{ id: WIN, content: { metadata: { name: "x" } }, token_info: { symbol: "WIN" } }, { id: GOOSE, content: { metadata: {} } }, { content: {} }] });
  assert.deepEqual(info.get(WIN), { symbol: "WIN", name: "x" });
  assert.equal(info.has(GOOSE), false);
  assert.equal(parseAssets(null).size, 0);
  assert.equal(parseAssets({ error: "no" }).size, 0);
});

test("text a coin's creator typed is cleaned before it is shown: no control or direction-changing characters, one space, a length cap", () => {
  assert.equal(cleanText("  hello \n\t world  ", 40), "hello world");
  assert.equal(cleanText(`evil${RLO}txt.exe`, 40), "eviltxt.exe", "a right-to-left override could reorder the text around it");
  assert.equal(cleanText(`a${ZWSP}b\u0000c${LRI}d`, 40), "abcd");
  assert.equal(cleanText("x".repeat(100), 12), `${"x".repeat(11)}${ELLIPSIS}`);
  assert.equal(cleanText("   ", 12), undefined);
  assert.equal(cleanText(42, 12), undefined);
  assert.equal(cleanText({ a: 1 }, 12), undefined);
});

test("a coin whose name is hostile comes through cleaned", () => {
  const info = parseAssets({ result: [asset(WIN, `A${RLO}B`.repeat(10), "<script>alert(1)</script>\n\n" + "n".repeat(80))] });
  const win = info.get(WIN)!;
  assert.ok(win.symbol!.length <= 12 && !win.symbol!.includes(RLO));
  assert.ok(win.name!.length <= 40 && !win.name!.includes("\n"));
  assert.ok(win.name!.startsWith("<script>"), "markup is left as plain text: the page shows text, it never runs it");
});

test("coins are looked up 100 to a call, with the key in the address and the ids in the body", async () => {
  const calls: { url: string; body: { method: string; params: { ids: string[] } } }[] = [];
  const fetchImpl: Fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url, body });
    return reply(200, { result: body.params.ids.map((id: string) => asset(id, "T", "Token")) });
  };
  const mints = Array.from({ length: 150 }, (_, i) => fake(i));
  const out = await heliusTokens("KEY", { fetchImpl, sleep: async () => {} })(mints);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.body.params.ids.length), [100, 50]);
  assert.ok(calls[0].url.includes("api-key=KEY") && calls[0].body.method === "getAssetBatch");
  assert.equal(out.size, 150);
});

test("a batch that fails is skipped and the others still come back", async () => {
  let n = 0;
  const fetchImpl: Fetch = async (_u, init) => {
    const ids = JSON.parse(String(init?.body)).params.ids as string[];
    return ++n <= 3 ? reply(500) : reply(200, { result: ids.map((id) => asset(id, "T", "Token")) }); // the first batch fails (and is retried to the limit)
  };
  const out = await heliusTokens("KEY", { fetchImpl, sleep: async () => {} })(Array.from({ length: 150 }, (_, i) => fake(i)));
  assert.equal(out.size, 50, "only the second batch answered");
});

test("anything that is not a coin address is never sent", async () => {
  let calls = 0;
  const fetchImpl: Fetch = async () => (calls++, reply(200, { result: [] }));
  await heliusTokens("KEY", { fetchImpl, sleep: async () => {} })(["../../x", "not a mint", "a,b", ""]);
  assert.equal(calls, 0);
});

/* ------------------------------ the name book ------------------------------ */

test("the name book asks only about coins it has not asked about, and says whether it learned anything", async () => {
  const asked: string[][] = [];
  const book = createNameBook(async (mints) => (asked.push(mints), new Map<string, TokenInfo>(mints.map((m) => [m, { symbol: m.slice(0, 3) }]))));
  assert.equal(await book.ensure([WIN, GOOSE]), true);
  assert.equal(await book.ensure([WIN]), false, "nothing new");
  assert.equal(await book.ensure([WIN, GOOSE, "OTHER"]), true);
  assert.deepEqual(asked, [[WIN, GOOSE], ["OTHER"]]);
  assert.deepEqual(Object.keys(book.snapshot()).sort(), [GOOSE, "OTHER", WIN].sort());
});

test("lookups run one at a time, so a later call waits for one still in flight and then sees its names", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const book = createNameBook(async (mints) => (await gate, new Map<string, TokenInfo>(mints.map((m) => [m, { symbol: "T" }]))));
  const first = book.ensure([WIN]);
  const second = book.ensure([WIN, GOOSE]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(Object.keys(book.snapshot()).sort(), [GOOSE, WIN].sort());
});

test("a failed lookup leaves those coins unnamed and never throws, and no lookup function means no names", async () => {
  const failing = createNameBook(async () => {
    throw new Error("down");
  });
  assert.equal(await failing.ensure([WIN]), false);
  assert.deepEqual(failing.snapshot(), {});
  assert.equal(await createNameBook(undefined).ensure([WIN]), false);
});

import { cleanImage } from "../src/lib/fumble/tokens.ts";

test("a coin's picture is kept only from Helius's image proxy, resized to a thumbnail", () => {
  const raw = "https://cdn.helius-rpc.com/cdn-cgi/image//https://example.com/coin.webp";
  assert.equal(cleanImage(raw), "https://cdn.helius-rpc.com/cdn-cgi/image/width=96,height=96,fit=cover,format=auto/https://example.com/coin.webp");
  assert.equal(cleanImage("https://example.com/coin.webp"), undefined);
  assert.equal(cleanImage("https://cdn.helius-rpc.com.evil.com/cdn-cgi/image//x"), undefined);
  assert.equal(cleanImage("https://cdn.helius-rpc.com/cdn-cgi/image//https://a.com/x y"), undefined);
  assert.equal(cleanImage(42), undefined);
});
