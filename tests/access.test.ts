import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { accessConfigured, accessToken, checkCode, hasAccess } from "../src/lib/access.ts";

const set = (code?: string, key?: string) => {
  if (code === undefined) delete process.env.ACCESS_CODE;
  else process.env.ACCESS_CODE = code;
  if (key === undefined) delete process.env.TIINGO_API_KEY;
  else process.env.TIINGO_API_KEY = key;
};
afterEach(() => set());

const req = (cookie?: string) => new Request("https://x.test/", cookie ? { headers: { cookie } } : {});

test("nothing is unlocked until a four-digit code and a key are both set", () => {
  set();
  assert.equal(accessConfigured(), false);
  set("12345", "k");
  assert.equal(accessConfigured(), false);
  set("1234");
  assert.equal(accessConfigured(), false);
  set("1234", "k");
  assert.equal(accessConfigured(), true);
});

test("only the right code passes", () => {
  set("1234", "key");
  assert.equal(checkCode("1234"), true);
  assert.equal(checkCode("1235"), false);
  assert.equal(checkCode("12345"), false);
  assert.equal(checkCode(1234), false);
});

test("the cookie grants access only with the right token, and stops working when the code changes", () => {
  set("1234", "key");
  const token = accessToken();
  assert.equal(hasAccess(req(`replay-access=${token}`)), true);
  assert.equal(hasAccess(req(`a=b; replay-access=${token}`)), true);
  assert.equal(hasAccess(req("replay-access=nope")), false);
  assert.equal(hasAccess(req()), false);
  set("9999", "key");
  assert.equal(hasAccess(req(`replay-access=${token}`)), false);
});
