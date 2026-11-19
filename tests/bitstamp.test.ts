import assert from "node:assert/strict";
import { test } from "node:test";
import { BITSTAMP_PAIRS, BITSTAMP_PRIMARY, parseBitstamp } from "../src/lib/bitstamp.ts";

test("Bitstamp candles parse into oldest-first daily closes and skip junk", () => {
  const rows = [
    { timestamp: "1420156800", close: "315.50" },
    { timestamp: "1420070400", close: "313.81" },
    { timestamp: "bad", close: "1" },
    { timestamp: "1420243200", close: "0" },
  ];
  const r = parseBitstamp(rows, "BTC-USD")!;
  assert.deepEqual(r.days.map((d) => [d.date, d.close]), [["2015-01-01", 313.81], ["2015-01-02", 315.5]]);
  assert.equal(r.meta.via, "bitstamp");
  assert.equal(r.meta.name, "Bitcoin");
  assert.equal(parseBitstamp([], "BTC-USD"), null);
});

test("only the coins where Bitstamp's history is as long as Yahoo's are asked first", () => {
  assert.deepEqual([...BITSTAMP_PRIMARY].sort(), ["BTC-USD", "ETH-USD", "XRP-USD"]);
  assert.ok(!("BNB-USD" in BITSTAMP_PAIRS));
  for (const s of BITSTAMP_PRIMARY) assert.ok(s in BITSTAMP_PAIRS);
});
