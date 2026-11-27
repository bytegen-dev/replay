import assert from "node:assert/strict";
import { test } from "node:test";
import { appUrlFrom, DEFAULT_APP_URL } from "../src/lib/site.ts";

test("the CoTrader app's address is a clean http(s) address, else the default", () => {
  assert.equal(DEFAULT_APP_URL, "https://app.replay.money");
  assert.equal(appUrlFrom(undefined), DEFAULT_APP_URL);
  assert.equal(appUrlFrom(""), DEFAULT_APP_URL);
  assert.equal(appUrlFrom("  https://app.example.com/  "), "https://app.example.com");
  assert.equal(appUrlFrom("http://localhost:3200"), "http://localhost:3200");
  assert.equal(appUrlFrom("app.replay.money"), DEFAULT_APP_URL);
  assert.equal(appUrlFrom("javascript:alert(1)"), DEFAULT_APP_URL);
  assert.equal(appUrlFrom("https://a.b c"), DEFAULT_APP_URL);
});
