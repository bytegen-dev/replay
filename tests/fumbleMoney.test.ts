import assert from "node:assert/strict";
import { test } from "node:test";
import { figure, localMoney, showIn, SOL_DISPLAY, SOL_UNIT, USD_DISPLAY, USD_UNIT } from "../src/lib/fumble/money.ts";

const NGN = { code: "NGN", symbol: "₦", perUsd: 1500 };

test("SOL leads by default, with the approximate dollar value under it and no sign on that line", () => {
  assert.deepEqual(figure(SOL_DISPLAY, 6.86, 1200), { main: "6.86 SOL", sub: "≈$1,200" });
  assert.deepEqual(figure(SOL_DISPLAY, -20.7, -3100, true), { main: "-20.7 SOL", sub: "≈$3,100" });
  assert.equal(figure(SOL_DISPLAY, 4.2, 600, true).main, "+4.20 SOL");
});

test("dollars lead when picked, with SOL under them, and the small line never has a sign", () => {
  assert.deepEqual(figure(USD_DISPLAY, 6.86, 1200), { main: "$1,200", sub: "6.86 SOL" });
  assert.deepEqual(figure(USD_DISPLAY, 18.3, 1284, true), { main: "+$1,284", sub: "18.3 SOL" });
  assert.deepEqual(figure(USD_DISPLAY, -20.7, -3100, true), { main: "-$3,100", sub: "20.7 SOL" });
});

test("another currency leads at today's rate, with SOL under it", () => {
  assert.deepEqual(figure(showIn(NGN, SOL_UNIT), 6.86, 1200), { main: "₦1,800,000", sub: "6.86 SOL" });
  assert.equal(figure(showIn(NGN, SOL_UNIT), 1, 100, true).main, "+₦150,000");
});

test("the secondary can be any currency, marked as approximate when it is converted", () => {
  assert.deepEqual(figure(showIn(SOL_UNIT, NGN), 6.86, 1200), { main: "6.86 SOL", sub: "≈₦1,800,000" });
  assert.deepEqual(figure(showIn(NGN, USD_UNIT), 6.86, 1200), { main: "₦1,800,000", sub: "≈$1,200" });
});

test("with no secondary, or the same currency twice, there is no small line", () => {
  assert.deepEqual(figure(showIn(SOL_UNIT, null), 6.86, 1200), { main: "6.86 SOL", sub: null });
  assert.deepEqual(figure(showIn(SOL_UNIT, SOL_UNIT), 6.86, 1200), { main: "6.86 SOL", sub: null });
  assert.deepEqual(figure(showIn(USD_UNIT, USD_UNIT), 6.86, 1200), { main: "$1,200", sub: null });
});

test("with no dollar price the big figure is in SOL whatever was picked, and a converted small line is left out", () => {
  assert.deepEqual(figure(USD_DISPLAY, -20.7, null, true), { main: "-20.7 SOL", sub: null });
  assert.deepEqual(figure(showIn(NGN, SOL_UNIT), 3.1, null), { main: "3.10 SOL", sub: null });
  assert.deepEqual(figure(SOL_DISPLAY, 3.1, null), { main: "3.10 SOL", sub: null });
});

test("a local amount drops its cents from 100 up, and keeps a minus", () => {
  assert.equal(localMoney(12.5, "€"), "€12.5");
  assert.equal(localMoney(1234.56, "€"), "€1,235");
  assert.equal(localMoney(-99.5, "€"), "-€99.5");
  assert.equal(localMoney(0, "€", true), "€0");
});
