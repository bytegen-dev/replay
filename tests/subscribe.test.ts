import assert from "node:assert/strict";
import { test } from "node:test";
import { validEmail } from "../src/lib/subscribe.ts";

test("email check accepts normal addresses and rejects junk", () => {
  for (const ok of ["a@b.co", "name.last+tag@example.com"]) assert.equal(validEmail(ok), true, ok);
  for (const bad of ["", "no-at.com", "a@b", "a b@c.com", "a@b..", "@x.com", 5, null, `${"a".repeat(250)}@x.com`]) assert.equal(validEmail(bad), false, String(bad));
});
