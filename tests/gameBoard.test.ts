import assert from "node:assert/strict";
import { test } from "node:test";
import { plausibleScore, validToken, validUsername } from "../src/lib/gameBoard.ts";

test("usernames are 3 to 16 simple characters, and not reserved or impersonating", () => {
  for (const ok of ["Tony_S", "bull-run", "a1b", "Trader_2018", "tonyx"]) assert.equal(validUsername(ok), true, ok);
  for (const bad of ["", "ab", "a".repeat(17), "has space", "emoji\u{1F680}", "bad!name", "admin", "Replay", "ADMIN", "tonystonk"]) assert.equal(validUsername(bad), false, bad);
});

test("a token is 32 to 64 lower-case hex characters", () => {
  assert.equal(validToken("a".repeat(32)), true);
  assert.equal(validToken("0123456789abcdef".repeat(4)), true);
  for (const bad of ["", "xyz", "A".repeat(32), "a".repeat(31), "a".repeat(65), 5, null]) assert.equal(validToken(bad), false);
});

test("a score has to be possible for the time the run took", () => {
  assert.equal(plausibleScore(0, 0), true);
  assert.equal(plausibleScore(500, 20_000), true); // 20 s covers at most about 5,600 px
  assert.equal(plausibleScore(100_000, 30_000), false, "far more than 30 seconds could earn");
  assert.equal(plausibleScore(-1, 10_000), false);
  assert.equal(plausibleScore(12.5, 10_000), false, "scores are whole numbers");
  assert.equal(plausibleScore(300_000, 10_000_000), false, "above the cap");
  assert.equal(plausibleScore(100, Number.NaN), false);
});
