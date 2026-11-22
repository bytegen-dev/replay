import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { humanRequired, humanToken, isHuman } from "../src/lib/human.ts";
import { countRun, limitMessage, limitsFor } from "../src/lib/limits.ts";
import { clearRateLimitMemory } from "../src/lib/rateLimit.ts";

afterEach(() => {
  clearRateLimitMemory();
  for (const k of ["RUN_LIMIT_ANON_DAY", "RUN_LIMIT_ANON_MINUTE", "TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]) delete process.env[k];
});

test("anonymous visitors get the smallest allowance, and every number can be set in the environment", () => {
  assert.ok(limitsFor("anonymous").day < limitsFor("user").day);
  assert.ok(limitsFor("user").day < limitsFor("trusted").day);
  process.env.RUN_LIMIT_ANON_DAY = "3";
  assert.equal(limitsFor("anonymous").day, 3);
  process.env.RUN_LIMIT_ANON_DAY = "nonsense";
  assert.equal(limitsFor("anonymous").day, 20, "a bad value falls back to the default");
});

test("runs are counted per visitor: the day's allowance runs out, then it says when it comes back", async () => {
  process.env.RUN_LIMIT_ANON_DAY = "3";
  process.env.RUN_LIMIT_ANON_MINUTE = "100";
  const a = { kind: "anonymous" as const, id: "aaa" };
  const b = { kind: "anonymous" as const, id: "bbb" };
  for (let i = 0; i < 3; i++) assert.equal((await countRun(a)).ok, true);
  const refused = await countRun(a);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "day");
  assert.doesNotMatch(limitMessage(refused), /sign in/i, "accounts are closed, so no sign-in is offered");
  assert.match(limitMessage(refused), /come back in/);
  process.env.ACCOUNTS_OPEN = "1";
  assert.match(limitMessage(refused), /Sign in to keep going/);
  delete process.env.ACCOUNTS_OPEN;
  assert.equal((await countRun(b)).ok, true, "someone else is not affected");
});

test("the per-minute ceiling stops a burst even when the day's allowance is large", async () => {
  process.env.RUN_LIMIT_ANON_MINUTE = "2";
  const v = { kind: "anonymous" as const, id: "burst" };
  assert.equal((await countRun(v)).ok, true);
  assert.equal((await countRun(v)).ok, true);
  const r = await countRun(v);
  assert.equal(r.ok, false);
  assert.equal(r.code, "minute");
  assert.match(limitMessage(r), /bit fast/);
});

test("a signed-in visitor who runs out is told the limit, not asked to sign in again", async () => {
  const msg = limitMessage({ ok: false, kind: "user", code: "day", limit: 150, resetSeconds: 7200, remaining: 0 });
  assert.match(msg, /limit of 150/);
  assert.doesNotMatch(msg, /Sign in/);
});

test("the bot check is off until both keys are set, and its pass cookie expires", () => {
  const withCookie = (v: string) => new Request("https://x.test/", { headers: { cookie: `replay-human=${v}` } });
  assert.equal(humanRequired(), false);
  assert.equal(isHuman(new Request("https://x.test/")), true, "no check set up: everyone passes");
  process.env.TURNSTILE_SECRET_KEY = "secret";
  assert.equal(humanRequired(), false, "the site key is needed too");
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
  assert.equal(humanRequired(), true);
  assert.equal(isHuman(new Request("https://x.test/")), false);
  const t = humanToken(1_000_000);
  assert.equal(isHuman(withCookie(t), 1_000_000 + 60_000), true);
  assert.equal(isHuman(withCookie(t), 1_000_000 + 13 * 3600 * 1000), false, "expired after 12 hours");
  assert.equal(isHuman(withCookie("1.abc"), 1_000_000), false);
});
