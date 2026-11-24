import assert from "node:assert/strict";
import { test } from "node:test";
import { base58Decode, base58Encode, nameAccount, onCurve, resolveSol, solName } from "../src/lib/fumble/sns.ts";

test("only plain .sol names are names, in lower case without the suffix", () => {
  assert.equal(solName("bytegen.sol"), "bytegen");
  assert.equal(solName("  ByteGen.SOL "), "bytegen");
  assert.equal(solName("my-name_1.sol"), "my-name_1");
  assert.equal(solName("bytegen"), null);
  assert.equal(solName("a.b.sol"), null);
  assert.equal(solName(".sol"), null);
  assert.equal(solName("DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj"), null);
});

test("base58 round-trips, including leading zero bytes", () => {
  const w = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
  assert.equal(base58Encode(base58Decode(w)), w);
  assert.equal(base58Encode(new Uint8Array(32)), "11111111111111111111111111111111");
  assert.deepEqual([...base58Decode("11111111111111111111111111111111")], new Array(32).fill(0));
});

test("a real wallet is on the curve and a name's account is not (it is a derived address)", () => {
  assert.equal(onCurve(base58Decode("DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj")), true);
  assert.equal(onCurve(base58Decode(nameAccount("bonfida"))), false);
});

test("a name's account address is the one the chain uses (checked live against bonfida.sol)", () => {
  assert.equal(nameAccount("bonfida"), "Crf8hzfthWGbGbLTVCiqRqV5MVnbpHB1L9KQMd6gsinb");
});

const account = (owner: string) => {
  const data = Buffer.concat([Buffer.alloc(32), Buffer.from(base58Decode(owner)), Buffer.alloc(32), Buffer.from("x")]);
  return { result: { value: { owner: "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX", data: [data.toString("base64"), "base64"] } } };
};

test("the owner is read from the name's account", async () => {
  const owner = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
  const w = await resolveSol("bytegen", { apiKey: "k", fetchImpl: async () => new Response(JSON.stringify(account(owner))) });
  assert.equal(w, owner);
});

test("a name with no account, or an account of another program, is not found", async () => {
  assert.equal(await resolveSol("nope", { apiKey: "k", fetchImpl: async () => new Response(JSON.stringify({ result: { value: null } })) }), null);
  const other = account("DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj");
  other.result.value.owner = "11111111111111111111111111111111";
  assert.equal(await resolveSol("nope", { apiKey: "k", fetchImpl: async () => new Response(JSON.stringify(other)) }), null);
});

test("a failed lookup throws without the key in the message", async () => {
  await assert.rejects(resolveSol("x", { apiKey: "secret-key", fetchImpl: async () => new Response("no", { status: 500 }) }), (e: Error) => !e.message.includes("secret-key"));
});
