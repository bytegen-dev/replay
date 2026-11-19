import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyByCode, CURRENCIES, isCurrency } from "../src/lib/fxCurrencies.ts";
import { crossRate, mergeHistory, parseFredCsv, parseFrankfurter, parseImf, rateOn, type FxPoint } from "../src/lib/fx.ts";

test("FRED csv: missing days are skipped and dollars-per-currency series are inverted", () => {
  const csv = "observation_date,DEXUSUK\n1971-01-04,2.4\n1971-01-05,.\n1971-01-06,2.5\n";
  const gbp = parseFredCsv(csv, "usd-per-ccy");
  assert.equal(gbp.length, 2);
  assert.equal(+gbp[0].perUsd.toFixed(4), +(1 / 2.4).toFixed(4));
  const jpy = parseFredCsv("DATE,DEXJPUS\n1971-01-04,357.73\n", "ccy-per-usd");
  assert.deepEqual(jpy, [{ date: "1971-01-04", perUsd: 357.73 }]);
});

test("Frankfurter time series becomes sorted points for the chosen currency", () => {
  const json = { rates: { "1999-01-05": { TRY: 0.316 }, "1999-01-04": { TRY: 0.3158 }, "1999-01-06": { PLN: 3.5 } } };
  assert.deepEqual(parseFrankfurter(json, "TRY").map((p) => p.date), ["1999-01-04", "1999-01-05"]);
  assert.deepEqual(parseFrankfurter(null, "TRY"), []);
});

test("IMF monthly values land on the last day of their month and are marked monthly", () => {
  const json = { series: { docs: [{ period: ["1957-01", "2024-02", "2024-03"], value: [0.714, "NA", 1500] }] } };
  const pts = parseImf(json);
  assert.deepEqual(pts, [{ date: "1957-01-31", perUsd: 0.714, monthly: true }, { date: "2024-03-31", perUsd: 1500, monthly: true }]);
  assert.equal(parseImf({}).length, 0);
});

test("rateOn finds the latest observation on or before a date, within the tolerance", () => {
  const daily: FxPoint[] = [{ date: "2020-01-02", perUsd: 1 }, { date: "2020-01-03", perUsd: 2 }, { date: "2020-01-10", perUsd: 3 }];
  assert.equal(rateOn(daily, "2020-01-03")?.perUsd, 2);
  assert.equal(rateOn(daily, "2020-01-05")?.perUsd, 2, "a weekend takes the Friday rate");
  assert.equal(rateOn(daily, "2020-01-01"), null, "before the series starts");
  assert.equal(rateOn(daily, "2020-02-15"), null, "too long after the last observation");
  const monthly: FxPoint[] = [{ date: "2013-02-28", perUsd: 155, monthly: true }, { date: "2013-03-31", perUsd: 157, monthly: true }];
  assert.equal(rateOn(monthly, "2013-03-31")?.perUsd, 157);
  assert.equal(rateOn(monthly, "2013-03-01")?.perUsd, 155, "the 1st uses the previous month-end");
  assert.equal(rateOn(monthly, "2013-06-30"), null);
});

test("history from two sources joins without overlapping the base", () => {
  const ecb: FxPoint[] = [{ date: "1999-01-04", perUsd: 1 }, { date: "1999-01-05", perUsd: 1 }];
  const imf: FxPoint[] = [{ date: "1998-12-31", perUsd: 9, monthly: true }, { date: "1999-01-31", perUsd: 9, monthly: true }, { date: "2025-06-30", perUsd: 9, monthly: true }];
  // older than the base starts, plus anything newer than the base ends
  assert.deepEqual(mergeHistory(ecb, imf).map((p) => p.date), ["1998-12-31", "1999-01-04", "1999-01-05", "1999-01-31", "2025-06-30"]);
});

test("cross rates go through the dollar", () => {
  // 1 USD = 1,500 NGN and 0.8 GBP, so 1 GBP is 1,875 NGN
  assert.equal(crossRate(0.8, 1500), 1875);
  assert.equal(crossRate(1, 1500), 1500);
});

test("the currency list has unique codes, USD, and the naira", () => {
  const codes = CURRENCIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(isCurrency("usd") && isCurrency("NGN") && !isCurrency("XYZ"));
  assert.equal(currencyByCode("ngn")?.symbol, "₦");
  assert.ok(CURRENCIES.every((c) => c.code === "USD" || c.fred || c.ecb || c.imf), "every currency has a source");
});
