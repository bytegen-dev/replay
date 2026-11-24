import assert from "node:assert/strict";
import { test } from "node:test";
import { isLimitError, NetError, saysLimit } from "../src/lib/fumble/net.ts";
import { birdeyeProvider, firstOf } from "../src/lib/fumble/prices.ts";

test("an answer that says the quota is used up is a limit, and an ordinary failure is not", () => {
  assert.equal(saysLimit('{"success":false,"message":"Compute units usage limit exceeded"}'), true);
  assert.equal(saysLimit("Too Many Requests"), true);
  assert.equal(saysLimit('{"message":"Token not found"}'), false);
  assert.equal(saysLimit(""), false);
  assert.equal(isLimitError(new NetError(429, "x")), true);
  assert.equal(isLimitError(new NetError(402, "x")), true);
  assert.equal(isLimitError(new NetError(400, "x", true)), true);
  assert.equal(isLimitError(new NetError(400, "x")), false);
  assert.equal(isLimitError(new NetError(500, "x")), false);
  assert.equal(isLimitError(new Error("network down")), false);
});

test("a source out of quota is reported and the next one still answers; other failures are not reported", async () => {
  const candles = [{ t: 1, h: 2, l: 1, c: 2 }];
  const reported: string[] = [];
  const price = firstOf(
    [
      { name: "first", get: async () => Promise.reject(new NetError(400, "first.example", true)) },
      { name: "second", get: async () => Promise.reject(new Error("timed out")) },
      { name: "third", get: async () => candles },
    ],
    (name) => reported.push(name),
  );
  assert.deepEqual(await price("MINT", 0, 10), { candles, source: "third" });
  // Only the quota failure counts as the system being busy.
  assert.deepEqual(reported, ["first"]);
});

test("Birdeye's 400 that says the compute units are used up is marked as a limit", async () => {
  const fetchImpl = async () => new Response('{"success":false,"message":"Compute units usage limit exceeded"}', { status: 400 });
  const provider = birdeyeProvider("key", { fetchImpl, sleep: async () => {}, now: () => 0 }, 0);
  await assert.rejects(provider("MINT", 0, 3600), (e: unknown) => isLimitError(e) && !String((e as Error).message).includes("key"));
  // A 400 for some other reason is a plain failure.
  const other = birdeyeProvider("key", { fetchImpl: async () => new Response('{"message":"bad address"}', { status: 400 }), sleep: async () => {}, now: () => 0 }, 0);
  await assert.rejects(other("MINT", 0, 3600), (e: unknown) => e instanceof NetError && !isLimitError(e));
});
