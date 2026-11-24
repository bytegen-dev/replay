import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChoice, DEFAULT_SETTINGS, normalizePair, parseSettings } from "../src/lib/fumble/settings.ts";

test("nothing stored, or junk, gives the defaults", () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("{not json"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('"a string"'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("[]"), DEFAULT_SETTINGS);
});

test("a chosen currency is read back, in any letter case", () => {
  assert.equal(parseSettings('{"currency":"SOL"}').currency, "SOL");
  assert.equal(parseSettings('{"currency":"USD"}').currency, "USD");
  assert.equal(parseSettings('{"currency":"ngn"}').currency, "NGN");
});

test("a currency the site does not know falls back to SOL", () => {
  assert.equal(parseSettings('{"currency":"XXX"}').currency, "SOL");
  assert.equal(parseSettings('{"currency":42}').currency, "SOL");
  assert.equal(parseSettings('{"other":"EUR"}').currency, "SOL");
});

test("the secondary currency is read back, with none, SOL or any known currency allowed", () => {
  assert.equal(parseSettings('{"second":"NONE"}').second, "NONE");
  assert.equal(parseSettings('{"currency":"EUR","second":"sol"}').second, "SOL");
  assert.equal(parseSettings('{"second":"eur"}').second, "EUR");
  assert.equal(parseSettings('{"second":"XXX"}').second, DEFAULT_SETTINGS.second);
  assert.equal(parseSettings(null).second, "USD");
});

test("sells only and the load size are read back, and anything else falls back to the defaults", () => {
  const s = parseSettings('{"sellsOnly":true,"perLoad":250}');
  assert.equal(s.sellsOnly, true);
  assert.equal(s.perLoad, 250);
  const bad = parseSettings('{"sellsOnly":"yes","perLoad":77}');
  assert.equal(bad.sellsOnly, false);
  assert.equal(bad.perLoad, 100);
});

const base = { ...DEFAULT_SETTINGS };
const apply = (s: typeof base, which: "primary" | "secondary", code: string) => ({ ...s, ...applyChoice(s, which, code) });

test("a currency as the primary makes SOL the secondary", () => {
  const s = apply({ ...base, currency: "SOL", second: "USD" }, "primary", "EUR");
  assert.deepEqual([s.currency, s.second], ["EUR", "SOL"]);
  const t = apply({ ...base, currency: "SOL", second: "NONE" }, "primary", "USD");
  assert.deepEqual([t.currency, t.second], ["USD", "SOL"]);
});

test("a currency as the secondary makes SOL the primary", () => {
  const s = apply({ ...base, currency: "EUR", second: "SOL" }, "secondary", "USD");
  assert.deepEqual([s.currency, s.second], ["SOL", "USD"]);
});

test("SOL can not be both: choosing it on one side moves the other to a currency", () => {
  const a = apply({ ...base, currency: "EUR", second: "SOL" }, "primary", "SOL");
  assert.deepEqual([a.currency, a.second], ["SOL", "USD"], "SOL primary needs a currency under it");
  const b = apply({ ...base, currency: "SOL", second: "EUR" }, "secondary", "SOL");
  assert.deepEqual([b.currency, b.second], ["USD", "SOL"], "SOL secondary needs a currency as the primary");
  const c = apply({ ...base, currency: "SOL", second: "EUR" }, "primary", "SOL");
  assert.deepEqual([c.currency, c.second], ["SOL", "EUR"], "choosing SOL again changes nothing");
});

test("no secondary is always allowed, and SOL as the primary keeps it", () => {
  const a = apply({ ...base, currency: "EUR", second: "SOL" }, "secondary", "NONE");
  assert.deepEqual([a.currency, a.second], ["EUR", "NONE"]);
  const b = apply(a, "primary", "SOL");
  assert.deepEqual([b.currency, b.second], ["SOL", "NONE"]);
});

test("a saved pair that breaks the rule is put right when it is read", () => {
  assert.deepEqual(normalizePair("SOL", "SOL"), { currency: "SOL", second: "USD" });
  assert.deepEqual(normalizePair("EUR", "USD"), { currency: "EUR", second: "SOL" });
  assert.deepEqual(normalizePair("EUR", "NONE"), { currency: "EUR", second: "NONE" });
  const read = parseSettings('{"currency":"SOL","second":"SOL"}');
  assert.deepEqual([read.currency, read.second], ["SOL", "USD"]);
  const two = parseSettings('{"currency":"EUR","second":"GBP"}');
  assert.deepEqual([two.currency, two.second], ["EUR", "SOL"]);
});

test("each number is shown, masked or hidden, defaulting to shown, and the wallet is only shown or masked", () => {
  const d = DEFAULT_SETTINGS;
  assert.deepEqual([d.hidePnl, d.hideRoundtrip, d.hideFumble, d.hideVolume, d.hideWallet], ["show", "show", "show", "show", false]);
  const kept = parseSettings(JSON.stringify({ hidePnl: "mask", hideRoundtrip: "hide", hideFumble: "show", hideVolume: "hide", hideWallet: true }));
  assert.deepEqual([kept.hidePnl, kept.hideRoundtrip, kept.hideFumble, kept.hideVolume, kept.hideWallet], ["mask", "hide", "show", "hide", true]);
  // Anything else is "show" and false.
  const junk = parseSettings(JSON.stringify({ hidePnl: "yes", hideRoundtrip: 0, hideFumble: null, hideVolume: "HIDE", hideWallet: "true" }));
  assert.deepEqual([junk.hidePnl, junk.hideRoundtrip, junk.hideFumble, junk.hideVolume, junk.hideWallet], ["show", "show", "show", "show", false]);
});

test("settings saved when the choice was only on or off still load: on means masked", () => {
  const old = parseSettings(JSON.stringify({ hidePnl: true, hideRoundtrip: false, hideFumble: true, hideWallet: true }));
  assert.deepEqual([old.hidePnl, old.hideRoundtrip, old.hideFumble, old.hideVolume, old.hideWallet], ["mask", "show", "mask", "show", true]);
});
