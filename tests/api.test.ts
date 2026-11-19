import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { guarded, json, presentedKey } from "../src/lib/apiHandler.ts";
import { paramsFromSearch, parseApiParams } from "../src/lib/apiParams.ts";
import { describeResult, toApiResult } from "../src/lib/dcaResult.ts";
import { EXAMPLES, exampleRequest, lastFullMonth } from "../src/lib/examples.ts";
import { openApiSpec } from "../src/lib/openapi.ts";
import { clearRateLimitMemory, hitRateLimit } from "../src/lib/rateLimit.ts";
import type { DcaResponse } from "../src/lib/types.ts";

const NOW = Date.UTC(2026, 10, 19); // 2026-11-19
const POLICY = "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489";

const ok = (input: Record<string, unknown>) => {
  const r = parseApiParams(input, NOW);
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};
const bad = (input: Record<string, unknown>) => {
  const r = parseApiParams(input, NOW);
  assert.ok(!r.ok, "expected an error");
  return r.fields;
};

test("last full month is the month before the current one, across a year boundary too", () => {
  assert.equal(lastFullMonth(NOW), "2026-10");
  assert.equal(lastFullMonth(Date.UTC(2027, 0, 5)), "2026-12");
});

test("a stock request: ticker is uppercased, 'to' defaults to last month, detail to summary", () => {
  const v = ok({ market: "stock", asset: "aapl", amount: "100", from: "2013-01" });
  assert.deepEqual(v.request, { address: "AAPL", chain: "equity", amount: 100, startMonth: "2013-01", endMonth: "2026-10", basis: "month-end" });
  assert.equal(v.detail, "summary");
});

test("friendly aliases work, and reinvest only applies to stocks", () => {
  assert.equal(ok({ market: "stocks", symbol: "SPY", amount: 500, from: "1998-01", reinvest: "true" }).request.reinvest, true);
  assert.equal(ok({ market: "stock", ticker: "SPY", amount: 500, from: "1998-01", reinvest: "1" }).request.address, "SPY");
  const token = ok({ market: "ethereum", asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", amount: 50, from: "2025-01", reinvest: "true" });
  assert.equal(token.request.reinvest, undefined, "tokens ignore reinvest");
  assert.equal(ok({ market: "stock", asset: "SPY", amount: 5, from: "2020-01", reinvest: "no" }).request.reinvest, undefined);
});

test("query strings and JSON bodies mean the same thing", () => {
  const fromQuery = ok(paramsFromSearch(new URLSearchParams("market=stock&asset=QQQ&amount=250&from=2005-01&detail=full")));
  const fromJson = ok({ market: "stock", asset: "QQQ", amount: 250, from: "2005-01", detail: "full" });
  assert.deepEqual(fromQuery, fromJson);
  assert.equal(fromJson.detail, "full");
});

test("a pasted Cardano asset id keeps the full id as `unit` and the policy as the address", () => {
  const v = ok({ market: "cardano", asset: POLICY + "4E4D4B52", amount: 200, from: "2024-12" });
  assert.equal(v.request.address, POLICY);
  assert.equal(v.request.unit, POLICY + "4e4d4b52");
  assert.equal(ok({ market: "cardano", asset: POLICY, amount: 200, from: "2024-12" }).request.unit, undefined);
});

test("errors name the API's own fields, not the internal ones", () => {
  assert.ok(bad({ asset: "AAPL", amount: 1, from: "2020-01" }).market);
  assert.match(bad({ market: "dogecoin", asset: "x", amount: 1, from: "2020-01" }).market, /Unknown market/);
  assert.ok(bad({ market: "stock", asset: "", amount: 1, from: "2020-01" }).asset);
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: "abc", from: "2020-01" }).amount);
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: -5, from: "2020-01" }).amount);
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: 5 }).from, "from is required");
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: 5, from: "Jan 2020" }).from);
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: 5, from: "2025-05", to: "2025-01" }).to);
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: 5, from: "2020-01", basis: "weekly" }).basis);
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: 5, from: "2020-01", basis: "day-of-month" }).day);
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: 5, from: "2020-01", detail: "everything" }).detail);
  assert.ok(bad({ market: "ethereum", asset: "0x123", amount: 5, from: "2020-01" }).asset);
});

test("every problem is reported in one response, not one at a time", () => {
  const f = bad({ market: "stock", asset: "AAPL", amount: "abc", basis: "weekly", from: "Jan 2020", detail: "lots" });
  assert.deepEqual(Object.keys(f).sort(), ["amount", "basis", "detail", "from"]);
  const g = bad({ market: "moon", amount: -1 });
  assert.ok(g.market && g.amount && g.from, "a bad market does not hide the other problems");
  assert.ok(!g.asset, "but it does not add a noisy complaint about the asset");
  assert.deepEqual(Object.keys(bad({})).sort(), ["amount", "from", "market"]);
});

test("range limits: stocks 40 years, tokens 6", () => {
  ok({ market: "stock", asset: "AAPL", amount: 5, from: "1987-01", to: "2026-10" });
  assert.ok(bad({ market: "stock", asset: "AAPL", amount: 5, from: "1980-01", to: "2026-10" }).to);
  assert.ok(bad({ market: "ethereum", asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", amount: 5, from: "2015-01", to: "2026-10" }).to);
});

test("the sentence says 'of' when months are missing, and 'loss' when it lost", () => {
  const base = { amount: 200, symbol: "NMKR", unit: "tokens" as const, priced: 17, total: 23, skipped: 6, invested: 3400, units: 32512818, decimals: 0, valueToday: 1176.64, gain: -2223.36, gainPct: -65.39 };
  assert.equal(describeResult(base), "$200.00 a month for 17 of 23 months bought 32,512,818 NMKR for $3,400.00. Today that is worth $1,176.64, a loss of $2,223.36 (-65.39%).");
  const stock = describeResult({ ...base, symbol: "SPY", unit: "shares", priced: 12, total: 12, skipped: 0, units: 3.5, decimals: 6, valueToday: 9000, gain: 6600, gainPct: 275 });
  assert.match(stock, /for 12 months bought 3\.500000 shares of SPY/);
  assert.match(stock, /a gain of \$6,600\.00/);
  assert.equal(describeResult({ ...base, priced: 0 }), "No month has a price, so there is nothing to total.");
});

const response = (over: Partial<DcaResponse> = {}): DcaResponse => ({
  token: { id: "AAPL", symbol: "AAPL", name: "Apple Inc." },
  chain: "equity",
  address: "AAPL",
  basis: "month-end",
  currentPrice: 300,
  currentPriceDate: "2026-11-18",
  rows: [
    { month: "2026-08", targetDate: "2026-08-31", priceDate: "2026-08-31", price: 100, source: "Yahoo", notes: [] },
    { month: "2026-09", targetDate: "2026-09-30", priceDate: "2026-09-30", price: 200, source: "Yahoo", notes: [{ code: "market-closed", text: "Market closed" }] },
    { month: "2026-10", targetDate: "2026-10-31", priceDate: null, price: null, source: "none", notes: [{ code: "no-data", text: "No trading day" }] },
  ],
  sources: [{ label: "Yahoo Finance", url: "https://finance.yahoo.com/quote/AAPL/history/" }],
  warnings: ["Prices are adjusted for stock splits only."],
  ...over,
});

test("the result adds up: units, invested, value, gain, and skipped months", () => {
  const req = { address: "AAPL", chain: "equity" as const, amount: 100, startMonth: "2026-08", endMonth: "2026-10", basis: "month-end" as const };
  const r = toApiResult(response(), req, "summary");
  assert.equal(r.summary.unit, "shares");
  assert.equal(r.summary.unitsBought, 1.5);
  assert.equal(r.summary.totalInvested, 200);
  assert.equal(r.summary.valueToday, 450);
  assert.equal(r.summary.gain, 250);
  assert.equal(r.summary.gainPercent, 125);
  assert.equal(r.summary.pricedMonths, 2);
  assert.deepEqual(r.summary.skippedMonthsList, ["2026-10"]);
  assert.equal(r.summary.totalMonths, 3);
  assert.equal(r.request.market, "stock");
  assert.equal(r.asset.market, "stock", "the asset names its market the same way the request does");
  assert.equal(r.months, undefined, "summary leaves out the months");
  assert.match(r.answer, /2 of 3 months bought 1\.500000 shares of AAPL for \$200\.00/);
});

test("detail=full lists every month with its units and notes", () => {
  const req = { address: "AAPL", chain: "equity" as const, amount: 100, startMonth: "2026-08", endMonth: "2026-10", basis: "month-end" as const };
  const r = toApiResult(response(), req, "full");
  assert.equal(r.months?.length, 3);
  assert.deepEqual(r.months?.[1], { month: "2026-09", priceDate: "2026-09-30", price: 200, invested: 100, units: 0.5, valueToday: 150, source: "Yahoo", notes: ["Market closed"] });
  assert.equal(r.months?.[2].units, null);
});

test("every ready-made example is a valid request that ends last month", () => {
  assert.ok(EXAMPLES.length >= 4);
  assert.ok(EXAMPLES.some((e) => e.id === "sp500-1998" && e.amount === 500 && e.startMonth === "1998-01"), "the S&P 500 since 1998 check is there");
  for (const ex of EXAMPLES) {
    const req = exampleRequest(ex, NOW);
    assert.equal(req.endMonth, "2026-10");
    const parsed = parseApiParams({ market: ex.market === "equity" ? "stock" : ex.market, asset: ex.address, amount: ex.amount, from: ex.startMonth, reinvest: ex.reinvest }, NOW);
    assert.ok(parsed.ok, `${ex.id}: ${JSON.stringify(parsed)}`);
  }
});

test("the OpenAPI description is coherent", () => {
  const spec = openApiSpec("https://example.test") as { openapi: string; servers: { url: string }[]; paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.servers[0].url, "https://example.test");
  for (const p of ["/api/v1/dca", "/api/v1/historical-price", "/api/v1/search", "/api/v1/examples"]) assert.ok(spec.paths[p], p);
  for (const s of ["Request", "Result", "HistoricalPrice", "Error"]) assert.ok(spec.components.schemas[s], s);
  assert.doesNotThrow(() => JSON.stringify(spec));
});

/* ---- keys and rate limits ---- */

const saved = { keys: process.env.DCA_API_KEYS, anon: process.env.DCA_API_RATE_LIMIT_ANON, key: process.env.DCA_API_RATE_LIMIT_KEY, db: process.env.DATABASE_URL };
afterEach(() => {
  for (const [name, value] of [["DCA_API_KEYS", saved.keys], ["DCA_API_RATE_LIMIT_ANON", saved.anon], ["DCA_API_RATE_LIMIT_KEY", saved.key], ["DATABASE_URL", saved.db]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  clearRateLimitMemory();
});

const call = (headers: Record<string, string> = {}, ip = "203.0.113.9") =>
  guarded(new Request("https://x.test/api/v1/dca", { headers: { "x-forwarded-for": ip, ...headers } }), async () => json(200, { ok: true }));

test("open by default: no key needed, CORS and rate-limit headers are present", async () => {
  delete process.env.DCA_API_KEYS;
  delete process.env.DATABASE_URL;
  const res = await call();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("x-ratelimit-limit"), "30");
  assert.ok(Number(res.headers.get("x-ratelimit-remaining")) <= 29);
});

test("with DCA_API_KEYS set, a key is required and only a right one gets in", async () => {
  delete process.env.DATABASE_URL;
  process.env.DCA_API_KEYS = "alpha-key, beta-key";
  const none = await call();
  assert.equal(none.status, 401);
  assert.equal((await none.json()).error.code, "api_key_required");
  assert.equal((await call({ authorization: "Bearer nope" })).status, 401);
  assert.equal((await call({ authorization: "Bearer beta-key" })).status, 200);
  assert.equal((await call({ "x-api-key": "alpha-key" })).status, 200);
  assert.equal((await call({ "x-api-key": "alpha-key" })).headers.get("x-ratelimit-limit"), "120", "keys get the higher limit");
  assert.equal(presentedKey(new Request("https://x.test", { headers: { authorization: "bearer   spaced " } })), "spaced");
});

test("the rate limit turns away the request after the limit, per caller, with retry-after", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.DCA_API_KEYS;
  process.env.DCA_API_RATE_LIMIT_ANON = "2";
  assert.equal((await call({}, "198.51.100.1")).status, 200);
  assert.equal((await call({}, "198.51.100.1")).status, 200);
  const third = await call({}, "198.51.100.1");
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error.code, "rate_limited");
  assert.ok(Number(third.headers.get("retry-after")) >= 1);
  assert.equal((await call({}, "198.51.100.2")).status, 200, "another caller is unaffected");
});

test("the counter resets with each window", async () => {
  delete process.env.DATABASE_URL;
  const t = Date.UTC(2026, 0, 1, 0, 0, 10);
  assert.equal((await hitRateLimit("k", 1, 60, t)).ok, true);
  const blocked = await hitRateLimit("k", 1, 60, t + 1000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.resetSeconds, 49);
  assert.equal((await hitRateLimit("k", 1, 60, t + 60_000)).ok, true, "a new minute starts fresh");
});
