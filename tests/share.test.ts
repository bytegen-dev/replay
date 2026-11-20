import assert from "node:assert/strict";
import { test } from "node:test";
import { hashSecret, isShareId, newDeleteToken, newShareId, parseShare } from "../src/lib/share.ts";

const row = (month: string, price: number | null) => ({
  month,
  targetDate: `${month}-28`,
  priceDate: price === null ? null : `${month}-28`,
  price,
  source: price === null ? "none" : "CoinGecko",
  notes: [],
});

const good = {
  tokenLabel: "NMKR",
  tokenName: "NMKR",
  chain: "Cardano",
  address: "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489",
  basis: "Month-end",
  amount: 200,
  currentPrice: 0.01,
  currentPriceDate: "2026-11-15",
  rows: [row("2026-09", 0.02), row("2026-10", null)],
  overrides: { "2026-10": 0.015 },
  sources: [{ label: "CoinGecko", url: "https://www.coingecko.com/en/coins/nmkr" }],
  warnings: ["one month n/a"],
};

test("ids are 8 url-safe chars and unique enough", () => {
  const ids = new Set(Array.from({ length: 500 }, newShareId));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.ok(isShareId(id));
  assert.ok(!isShareId("short"));
  assert.ok(!isShareId("../etc/pw"));
});

test("delete tokens are long and hash deterministically", () => {
  const t = newDeleteToken();
  assert.ok(t.length >= 32);
  assert.equal(hashSecret(t), hashSecret(t));
  assert.notEqual(hashSecret(t), hashSecret(newDeleteToken()));
});

test("a good payload round-trips", () => {
  const p = parseShare(good);
  assert.equal(typeof p, "object");
  if (typeof p === "string") return;
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.overrides, { "2026-10": 0.015 });
  assert.equal(p.sources.length, 1);
});

test("rejects bad rows, amounts and sizes", () => {
  assert.equal(typeof parseShare(null), "string");
  assert.equal(typeof parseShare({ ...good, rows: [] }), "string");
  assert.equal(typeof parseShare({ ...good, amount: 0 }), "string");
  assert.equal(typeof parseShare({ ...good, rows: [row("2026-13", 1)] }), "string");
  assert.equal(typeof parseShare({ ...good, rows: [row("2026-09", -1)] }), "string");
  const months = (n: number) => Array.from({ length: n }, (_, i) => row(`${1990 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, 1));
  assert.equal(typeof parseShare({ ...good, rows: months(481) }), "string", "more than 480 months (40 years) is refused");
  assert.equal(typeof parseShare({ ...good, rows: months(480) }), "object", "a 40-year stock run can be shared");
});

test("only https source links survive", () => {
  const p = parseShare({
    ...good,
    sources: [
      { label: "bad", url: "javascript:alert(1)" },
      { label: "bad2", url: "http://example.com" },
      { label: "data", url: "data:text/html,x" },
      { label: "ok", url: "https://example.com/a" },
    ],
  });
  assert.ok(typeof p === "object");
  if (typeof p === "string") return;
  assert.deepEqual(p.sources, [{ label: "ok", url: "https://example.com/a" }]);
});

test("unknown fields are dropped, long text is capped, bad overrides ignored", () => {
  const p = parseShare({
    ...good,
    evil: "<script>",
    tokenName: "x".repeat(1000),
    overrides: { "2026-10": -5, "not-a-month": 1, "2026-09": 0.5 },
    rows: [{ ...row("2026-09", 0.02), extra: "x", notes: [{ code: "bogus", text: "no" }, { code: "manual", text: "y".repeat(1000) }] }],
  });
  assert.ok(typeof p === "object");
  if (typeof p === "string") return;
  assert.ok(!("evil" in p));
  assert.equal(p.tokenName.length, 100);
  assert.deepEqual(p.overrides, { "2026-09": 0.5 });
  assert.ok(!("extra" in p.rows[0]));
  assert.equal(p.rows[0].notes.length, 1);
  assert.equal(p.rows[0].notes[0].text.length, 300);
});

test("every price source survives a share, including DexHunter", () => {
  for (const source of ["CoinGecko", "GeckoTerminal", "DexHunter", "manual"]) {
    const p = parseShare({ ...good, rows: [{ ...row("2026-09", 0.02), source }] });
    assert.ok(typeof p === "object");
    if (typeof p === "string") return;
    assert.equal(p.rows[0].source, source);
  }
  const p = parseShare({ ...good, rows: [{ ...row("2026-09", 0.02), source: "Made Up" }] });
  assert.ok(typeof p === "object" && p.rows[0].source === "none", "an unknown source is still dropped");
});

import { simulateLeverage } from "../src/lib/leverage.ts";

test("a leveraged result round-trips through parseShare, and a broken one is refused", () => {
  const lev = simulateLeverage({
    buys: [{ month: "2026-09", date: "2026-09-01", price: 100, amount: 200 }],
    daily: [
      { date: "2026-09-01", price: 100 },
      { date: "2026-09-10", price: 120 },
    ],
    endDate: "2026-09-10",
    settings: { leverage: 5 },
  });
  const ok = parseShare({ ...good, leverage: lev });
  assert.ok(typeof ok !== "string");
  if (typeof ok !== "string") {
    assert.equal(ok.leverage?.summary.value, lev.summary.value);
    assert.equal(ok.leverage?.series.length, lev.series.length);
  }
  assert.equal(typeof parseShare({ ...good, leverage: { ...lev, series: "x" } }), "string");
});
