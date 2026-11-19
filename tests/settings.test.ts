import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, HEAD_SCRIPT, parseSettings, resolveTheme } from "../src/lib/settings.ts";

test("nothing stored means the defaults: follow the system, motion on, normal contrast", () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(""), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("not json"), DEFAULT_SETTINGS);
});

test("stored values are read, and unknown ones are ignored", () => {
  assert.deepEqual(parseSettings('{"theme":"light","reduceMotion":true,"highContrast":true}'), { theme: "light", reduceMotion: true, highContrast: true });
  assert.deepEqual(parseSettings('{"theme":"neon","reduceMotion":"yes","highContrast":1}'), DEFAULT_SETTINGS);
  assert.equal(parseSettings('{"theme":"dark"}').theme, "dark");
});

test("system follows the device, the others do not", () => {
  assert.equal(resolveTheme("system", true), "light");
  assert.equal(resolveTheme("system", false), "dark");
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", true), "dark");
});

test("the head script is valid JavaScript and sets the same attributes", () => {
  assert.doesNotThrow(() => new Function(HEAD_SCRIPT));
  assert.match(HEAD_SCRIPT, /data-?theme|dataset\.theme/);
  assert.match(HEAD_SCRIPT, /reduceMotion/);
  assert.match(HEAD_SCRIPT, /highContrast/);
});
