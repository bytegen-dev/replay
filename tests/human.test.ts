import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { HUMAN_COOKIE, humanRequired, humanToken, isHuman } from "../src/lib/human.ts";

const withCookie = (value: string) => new Request("https://example.test/", { headers: { cookie: `${HUMAN_COOKIE}=${value}` } });
const bare = () => new Request("https://example.test/");
const on = () => {
  process.env.TURNSTILE_SECRET_KEY = "secret-for-tests";
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-for-tests";
};
afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

test("with no keys set the check is off and everyone passes", () => {
  assert.equal(humanRequired(), false);
  assert.equal(isHuman(bare()), true);
});

test("with keys set, a visitor with no pass is turned back", () => {
  on();
  assert.equal(humanRequired(), true);
  assert.equal(isHuman(bare()), false);
});

test("a pass the server issued is accepted", () => {
  on();
  assert.equal(isHuman(withCookie(humanToken())), true);
});

test("an expired pass, or a made-up one, is not", () => {
  on();
  const old = humanToken(Date.now() - 13 * 3600 * 1000);
  assert.equal(isHuman(withCookie(old)), false);
  assert.equal(isHuman(withCookie("9999999999.deadbeef")), false);
  assert.equal(isHuman(withCookie("garbage")), false);
});

test("a pass signed with another secret is not accepted", () => {
  on();
  const token = humanToken();
  process.env.TURNSTILE_SECRET_KEY = "a-different-secret";
  assert.equal(isHuman(withCookie(token)), false);
});
