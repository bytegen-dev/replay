import assert from "node:assert/strict";
import { test } from "node:test";
import { createKolDirectory, fetchKols, memoryKolStore, parseKols, searchKols, type Kol } from "../src/lib/fumble/kols.ts";

const A = "suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK";
const B = "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm";
const C = "G5nxEXuFMfV74DSnsrSatqCW32F34XUnBeq3PfDS7w5E";

const page = (traders: unknown[], next?: string) => ({ traders, pagination: { hasMore: !!next, nextCursor: next } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("a page is read into KOLs with a public name, dropping the nameless and tidying handles", () => {
  const { kols, next } = parseKols(
    page([
      { wallet: A, identity: { name: "Cupsey", twitter: "@@Cupseyy" } },
      { wallet: B, identity: {} },
      { wallet: C, identity: { name: "  Profit​ ", twitter: "not a handle!" } },
      { wallet: "short", identity: { name: "Bad" } },
    ]),
  );
  assert.deepEqual(kols, [
    { name: "Cupsey", twitter: "Cupseyy", wallet: A },
    { name: "Profit", wallet: C },
  ]);
  assert.equal(next, null);
});

test("every page is fetched, with the key in a header and a wallet kept once", async () => {
  const calls: { url: string; key: string | null }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, key: new Headers(init?.headers).get("x-api-key") });
    return url.includes("cursor=c1") ? json(page([{ wallet: B, identity: { name: "Gake" } }, { wallet: A, identity: { name: "Cupsey again" } }])) : json(page([{ wallet: A, identity: { name: "Cupsey" } }], "c1"));
  };
  const list = await fetchKols("k-1", fetchImpl);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.key === "k-1"));
  assert.ok(calls[1].url.includes("cursor=c1"));
  assert.deepEqual(list.map((k) => k.wallet).sort(), [A, B].sort());
});

test("a failed call throws without the key in the message", async () => {
  await assert.rejects(fetchKols("secret-key", async () => json({}, 401)), (e: Error) => !e.message.includes("secret-key"));
});

const list: Kol[] = [
  { name: "Cupsey", twitter: "Cupseyy", wallet: A },
  { name: "Gake", twitter: "Ga__ke", wallet: B },
  { name: "Cup Of Joe", wallet: C },
];

test("search puts exact names first, then names that start with it, then handles, then the rest, and needs two letters", () => {
  assert.deepEqual(searchKols(list, "cup").map((k) => k.name), ["Cupsey", "Cup Of Joe"]);
  assert.deepEqual(searchKols(list, "cupsey").map((k) => k.name), ["Cupsey"]);
  assert.deepEqual(searchKols(list, "@ga__").map((k) => k.name), ["Gake"]);
  assert.deepEqual(searchKols(list, "of joe").map((k) => k.name), ["Cup Of Joe"]);
  assert.deepEqual(searchKols(list, "c"), []);
  assert.deepEqual(searchKols(list, "zzz"), []);
});

test("the directory fetches once, saves the list, and answers from it", async () => {
  const store = memoryKolStore();
  let calls = 0;
  const fetchImpl = async () => (calls++, json(page([{ wallet: A, identity: { name: "Cupsey" } }])));
  const d = createKolDirectory({ apiKey: "k", store, fetchImpl, now: () => 1000 });
  assert.equal((await d.search("cup"))[0].wallet, A);
  assert.equal((await d.search("cup")).length, 1);
  assert.equal(calls, 1);
  assert.equal((await store.load())?.kols.length, 1);
});

test("a saved list is used without a call, and fetched again once a day old", async () => {
  const store = memoryKolStore();
  await store.save([{ name: "Cupsey", wallet: A }], 1000);
  let calls = 0;
  let clock = 1000 + 3600;
  const fetchImpl = async () => (calls++, json(page([{ wallet: B, identity: { name: "Gake" } }])));
  const d = createKolDirectory({ apiKey: "k", store, fetchImpl, now: () => clock });
  assert.equal((await d.search("cup")).length, 1);
  assert.equal(calls, 0);
  clock = 1000 + 86400 + 10;
  await d.search("cup"); // starts the refresh, answers from the old list
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 1);
  assert.equal((await d.search("gake"))[0].wallet, B);
});

test("a failed fetch leaves the old list in use", async () => {
  const store = memoryKolStore();
  await store.save([{ name: "Cupsey", wallet: A }], 0);
  const d = createKolDirectory({ apiKey: "k", store, fetchImpl: async () => json({}, 500), now: () => 999999 });
  assert.equal((await d.search("cup"))[0].wallet, A);
});

test("the directory recognises a wallet on the list, and not one that is not", async () => {
  const store = memoryKolStore();
  await store.save([{ name: "Cupsey", twitter: "Cupseyy", wallet: A }], 1000);
  const d = createKolDirectory({ apiKey: "k", store, fetchImpl: async () => json({}, 500), now: () => 1100 });
  assert.equal((await d.find(A))?.name, "Cupsey");
  assert.equal(await d.find(B), null);
});
