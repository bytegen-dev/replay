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
  const many = Array.from({ length: 73 }, (_, i) => row(`${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, 1));
  assert.equal(typeof parseShare({ ...good, rows: many }), "string");
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
