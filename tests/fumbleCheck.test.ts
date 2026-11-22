import assert from "node:assert/strict";
import { test } from "node:test";
import { lookWallet, rememberedLook, type WalletStatus } from "../src/lib/fumble/check.ts";
import { NetError } from "../src/lib/fumble/net.ts";

const WALLET = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const answer = (result: unknown, status = 200) => async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status });
const noWait = async () => {};

test("a wallet with a transaction is active", async () => {
  assert.equal(await lookWallet(WALLET, { apiKey: "k", fetchImpl: answer([{ signature: "abc" }]), sleep: noWait }), "active");
});

test("a wallet with no transactions is empty", async () => {
  assert.equal(await lookWallet(WALLET, { apiKey: "k", fetchImpl: answer([]), sleep: noWait }), "empty");
});

test("the look asks for one signature and nothing more", async () => {
  let body: { method?: string; params?: unknown[] } = {};
  await lookWallet(WALLET, {
    apiKey: "k",
    sleep: noWait,
    fetchImpl: async (_u, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ result: [] }), { status: 200 });
    },
  });
  assert.equal(body.method, "getSignaturesForAddress");
  assert.deepEqual(body.params, [WALLET, { limit: 1 }]);
});

test("a failed look throws, and the error carries no key", async () => {
  await assert.rejects(lookWallet(WALLET, { apiKey: "SECRETKEY", fetchImpl: answer(null, 403), sleep: noWait }), (e: Error) => e instanceof NetError && !e.message.includes("SECRETKEY"));
  await assert.rejects(lookWallet(WALLET, { apiKey: "k", fetchImpl: answer({ not: "a list" }), sleep: noWait }));
});

test("a wallet looked at twice in a row costs one call", async () => {
  let calls = 0;
  const look = rememberedLook(async () => (calls++, "active" as WalletStatus));
  await look(WALLET);
  await look(WALLET);
  assert.equal(calls, 1);
});

test("two asks at the same moment share one call", async () => {
  let calls = 0;
  const look = rememberedLook(async () => (calls++, await new Promise((r) => setTimeout(r, 10)), "active" as WalletStatus));
  const [a, b] = await Promise.all([look(WALLET), look(WALLET)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
});

test("an empty wallet is remembered for less time than an active one, since it may get its first transaction", async () => {
  let t = 0;
  let calls = 0;
  const look = rememberedLook(async () => (calls++, "empty" as WalletStatus), { activeSeconds: 600, emptySeconds: 30, now: () => t });
  await look(WALLET);
  t = 20_000;
  await look(WALLET);
  assert.equal(calls, 1, "still remembered after 20 seconds");
  t = 40_000;
  await look(WALLET);
  assert.equal(calls, 2, "looked at again after 40 seconds");

  let n = 0;
  const active = rememberedLook(async () => (n++, "active" as WalletStatus), { activeSeconds: 600, now: () => t });
  await active(WALLET);
  t += 300_000;
  await active(WALLET);
  assert.equal(n, 1, "an active wallet is still remembered after five minutes");
});

test("a failed look is not remembered", async () => {
  let calls = 0;
  const look = rememberedLook(async () => {
    calls++;
    if (calls === 1) throw new Error("busy");
    return "active";
  });
  await assert.rejects(look(WALLET));
  assert.equal(await look(WALLET), "active");
  assert.equal(calls, 2);
});
