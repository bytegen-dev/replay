import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { adminConfigured, adminToken, checkAdminPassword, isAdmin } from "../src/lib/adminAuth.ts";
import { decrypt, encrypt, vaultReady } from "../src/lib/vault.ts";

const setPw = (pw?: string) => {
  if (pw === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = pw;
};
afterEach(() => setPw());

const withCookie = (v: string) => new Request("https://x.test/", { headers: { cookie: `replay-admin=${v}` } });

test("the admin page needs a password of at least 8 characters", () => {
  setPw();
  assert.equal(adminConfigured(), false);
  assert.equal(checkAdminPassword("anything"), false);
  setPw("short");
  assert.equal(adminConfigured(), false);
  setPw("correct horse");
  assert.equal(adminConfigured(), true);
  assert.equal(checkAdminPassword("correct horse"), true);
  assert.equal(checkAdminPassword("wrong horse!"), false);
  assert.equal(checkAdminPassword(12345678), false);
});

test("the admin cookie works until it expires and stops when the password changes", () => {
  setPw("correct horse");
  const t = adminToken(1_000_000);
  assert.equal(isAdmin(withCookie(t), 1_000_000 + 60_000), true);
  assert.equal(isAdmin(withCookie(t), 1_000_000 + 8 * 24 * 3600 * 1000), false, "expired after a week");
  assert.equal(isAdmin(withCookie("123.abc"), 1_000_000), false);
  assert.equal(isAdmin(new Request("https://x.test/"), 1_000_000), false);
  setPw("another password");
  assert.equal(isAdmin(withCookie(t), 1_000_000 + 60_000), false);
});

test("stored keys are encrypted, read back, and unreadable with another password", () => {
  setPw("correct horse");
  assert.equal(vaultReady(), true);
  const blob = encrypt("abcdefghijklmnopqrstuvwxyz0123456789ABCD");
  assert.ok(!blob.includes("abcdefgh"));
  assert.notEqual(encrypt("same"), encrypt("same"), "a fresh iv every time");
  assert.equal(decrypt(blob), "abcdefghijklmnopqrstuvwxyz0123456789ABCD");
  assert.equal(decrypt(blob.slice(0, -4) + "AAAA"), null, "tampering is caught");
  setPw("another password");
  assert.equal(decrypt(blob), null);
});
