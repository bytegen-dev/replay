import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTime, inferChain, parseHistoricalQuery, parseMarketPrefix, parseTime, parseWhen, parseZone, type When } from "../src/lib/when.ts";

const NOW = Date.UTC(2026, 10, 19, 15, 30, 45); // 19 Nov 2026, 15:30:45 UTC
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";
const ok = (input: { date?: string; time?: string; tz?: string }, now = NOW): When => {
  const r = parseWhen(input, now);
  assert.ok(r.ok, r.ok ? "" : `${r.field}: ${r.error}`);
  return r.value;
};
const bad = (input: { date?: string; time?: string; tz?: string }, now = NOW) => {
  const r = parseWhen(input, now);
  assert.ok(!r.ok, "expected an error");
  return r;
};

/* ---- the formats the bot command asked for ---- */

test("dd/mm/yyyy, day first, with and without a time", () => {
  const day = ok({ date: "15/09/2026" });
  assert.equal(day.precision, "day");
  assert.equal(day.dateUtc, "2026-09-15");
  assert.equal(iso(day.instantMs), "2026-09-16T00:00Z", "a whole day is priced at its close: the moment the next day starts");
  assert.equal(day.timeUtc, null);
  assert.match(day.description, /15 Sep 2026.*closing price/);

  const min = ok({ date: "15/09/2026", time: "13:40" });
  assert.equal(min.precision, "minute");
  assert.equal(iso(min.instantMs), "2026-09-15T13:40Z");
  assert.equal(min.timeUtc, "13:40");
  assert.equal(min.description, "15 Sep 2026, 13:40 UTC");
});

test("other numeric separators, ISO dates and 2-digit years", () => {
  for (const d of ["15-09-2026", "15.09.2026", "2026-09-15", "2026/09/15", "5/9/2026".replace("5/9", "15/9")]) assert.equal(ok({ date: d }).dateUtc, "2026-09-15", d);
  const short = ok({ date: "15/09/26" });
  assert.equal(short.dateUtc, "2026-09-15");
  assert.ok(short.assumptions.some((a) => /2-digit year/.test(a)));
});

test("written dates: month first or day first, abbreviations, ordinals, commas", () => {
  for (const d of ["September 15 2026", "Sept 15th, 2026", "15 September 2026", "15th of Sep 2026", "sep 15, 2026", "SEPTEMBER 15 2026"]) assert.equal(ok({ date: d }).dateUtc, "2026-09-15", d);
});

test("no year means this year, and says so", () => {
  const w = ok({ date: "September 15" });
  assert.equal(w.dateUtc, "2026-09-15");
  assert.deepEqual(w.assumptions, ["No year given, so used 2026."]);
  assert.equal(ok({ date: "15 sep" }).dateUtc, "2026-09-15");
});

test("a year-less day that is still ahead means the most recent one", () => {
  const w = ok({ date: "December 25" });
  assert.equal(w.dateUtc, "2025-12-25");
  assert.match(w.assumptions[0], /hasn't happened yet, so used 2025/);
  const leap = ok({ date: "February 29" });
  assert.equal(leap.dateUtc, "2024-02-29", "no 29 Feb in 2025 or 2026, so the last leap day");
  assert.match(leap.assumptions[0], /doesn't exist in 2026/);
  assert.equal(ok({ date: "November 19" }).dateUtc, "2026-11-19", "today is not ahead");
});

test("relative days, weeks, months and years", () => {
  assert.equal(ok({ date: "5 days ago" }).dateUtc, "2026-11-14");
  assert.equal(ok({ date: "3 weeks ago" }).dateUtc, "2026-10-29");
  assert.equal(ok({ date: "5 months ago" }).dateUtc, "2026-06-19");
  assert.equal(ok({ date: "1 year ago" }).dateUtc, "2025-11-19");
  assert.equal(ok({ date: "a week ago" }).dateUtc, "2026-11-12");
  assert.equal(ok({ date: "two days ago" }).dateUtc, "2026-11-17");
  assert.equal(ok({ date: "last month" }).dateUtc, "2026-10-19");
  assert.equal(ok({ date: "yesterday" }).dateUtc, "2026-11-18");
  assert.equal(ok({ date: "5 DAYS AGO" }).dateUtc, "2026-11-14");
});

test("months ago is calendar arithmetic: 31 March minus a month is the end of February", () => {
  const march31 = Date.UTC(2026, 2, 31, 12, 0, 0);
  assert.equal(ok({ date: "1 month ago" }, march31).dateUtc, "2026-02-28");
  assert.equal(ok({ date: "1 year ago" }, Date.UTC(2028, 1, 29, 9, 0, 0)).dateUtc, "2027-02-28");
  assert.equal(ok({ date: "13 months ago" }, march31).dateUtc, "2025-02-28");
});

test("minutes and hours ago are exact moments, not days", () => {
  const h = ok({ date: "2 hours ago" });
  assert.equal(h.precision, "minute");
  assert.equal(iso(h.instantMs), "2026-11-19T13:30Z");
  assert.equal(iso(ok({ date: "30 min ago" }).instantMs), "2026-11-19T15:00Z");
  assert.equal(iso(ok({ date: "an hour ago" }).instantMs), "2026-11-19T14:30Z");
});

test("a relative day can carry a time", () => {
  const w = ok({ date: "5 days ago", time: "13:40" });
  assert.equal(iso(w.instantMs), "2026-11-14T13:40Z");
  assert.equal(iso(ok({ date: "5 days ago 13:40" }).instantMs), "2026-11-14T13:40Z", "a time inside the date text is found");
  assert.equal(iso(ok({ date: "September 15 2026 at 1:40pm" }).instantMs), "2026-09-15T13:40Z");
});

test("clock times: 24-hour, am/pm, bare hours, 13h40", () => {
  for (const [t, expect] of [["13:40", "13:40"], ["1:40pm", "13:40"], ["1:40 PM", "13:40"], ["1pm", "13:00"], ["12am", "00:00"], ["12pm", "12:00"], ["9am", "09:00"], ["13h40", "13:40"], ["0:05", "00:05"], ["23:59", "23:59"], ["13:40:30", "13:40"]] as const) {
    assert.equal(ok({ date: "15/09/2026", time: t }).timeUtc, expect, t);
  }
});

test("today and now: the latest price, flagged as such", () => {
  const today = ok({ date: "today" });
  assert.equal(today.isNow, true);
  assert.equal(today.precision, "day");
  assert.ok(today.assumptions.some((a) => /isn't over yet/.test(a)));
  assert.equal(iso(today.instantMs), "2026-11-19T15:30Z");

  const now = ok({});
  assert.equal(now.isNow, true);
  assert.equal(now.precision, "minute");
  assert.equal(now.description, "now (latest price)");
  assert.equal(ok({ date: "now" }).isNow, true);
});

test("a time alone means today at that time", () => {
  const w = ok({ time: "13:40" });
  assert.equal(iso(w.instantMs), "2026-11-19T13:40Z");
  assert.ok(w.assumptions.includes("No date given, so used today."));
  assert.equal(w.isNow, false);
});

test("a unix timestamp is an exact moment", () => {
  assert.equal(iso(ok({ date: "1757943600" }).instantMs), "2025-09-15T13:40Z");
  assert.equal(iso(ok({ date: "1757943600000" }).instantMs), "2025-09-15T13:40Z");
});

/* ---- timezones ---- */

test("a fixed offset moves the time into UTC", () => {
  const w = ok({ date: "15/09/2026", time: "13:40", tz: "UTC+2" });
  assert.equal(iso(w.instantMs), "2026-09-15T11:40Z");
  assert.equal(w.timezone, "UTC+02:00");
  assert.ok(w.assumptions.some((a) => /read as UTC\+02:00.*11:40 UTC/.test(a)));
  assert.equal(iso(ok({ date: "15/09/2026", time: "13:40", tz: "GMT-5" }).instantMs), "2026-09-15T18:40Z");
  assert.equal(iso(ok({ date: "15/09/2026", time: "13:40", tz: "+05:30" }).instantMs), "2026-09-15T08:10Z");
  assert.equal(iso(ok({ date: "15/09/2026", time: "13:40", tz: "EST" }).instantMs), "2026-09-15T18:40Z");
});

test("named zones follow daylight saving", () => {
  assert.equal(iso(ok({ date: "01/07/2026", time: "13:40", tz: "Europe/London" }).instantMs), "2026-07-01T12:40Z", "BST in summer");
  assert.equal(iso(ok({ date: "15/01/2026", time: "13:40", tz: "Europe/London" }).instantMs), "2026-01-15T13:40Z", "GMT in winter");
  assert.equal(iso(ok({ date: "01/07/2026", time: "09:30", tz: "America/New_York" }).instantMs), "2026-07-01T13:30Z");
  assert.equal(iso(ok({ date: "15/01/2026", time: "09:30", tz: "America/New_York" }).instantMs), "2026-01-15T14:30Z");
  assert.equal(iso(ok({ date: "15/09/2026", time: "13:40", tz: "Africa/Lagos" }).instantMs), "2026-09-15T12:40Z");
});

test("a whole day in another zone ends at that zone's midnight", () => {
  const w = ok({ date: "15/09/2026", tz: "UTC+2" });
  assert.equal(iso(w.instantMs), "2026-09-15T22:00Z");
  assert.equal(w.dateUtc, "2026-09-15");
  assert.ok(w.assumptions.some((a) => /ends at midnight UTC\+02:00/.test(a)));
});

test("'today' follows the zone it is asked in", () => {
  // 23:30 UTC on 19 Nov is already the 20th in UTC+2.
  const late = Date.UTC(2026, 10, 19, 23, 30, 0);
  assert.equal(ok({ date: "yesterday", tz: "UTC+2" }, late).dateUtc, "2026-11-19");
  assert.equal(ok({ date: "yesterday" }, late).dateUtc, "2026-11-18");
});

test("zone parsing", () => {
  assert.equal(parseZone("")?.label, "UTC");
  assert.equal(parseZone("utc")?.label, "UTC");
  assert.equal(parseZone("UTC+2")?.label, "UTC+02:00");
  assert.equal(parseZone("+0530")?.label, "UTC+05:30");
  assert.equal(parseZone("Europe/London")?.label, "Europe/London");
  assert.equal(parseZone("UTC+15"), null);
  assert.equal(parseZone("Mars/Olympus"), null);
  assert.equal(parseZone("nonsense"), null);
});

/* ---- mistakes get a useful message ---- */

test("impossible and unreadable dates", () => {
  assert.match((bad({ date: "31/02/2026" }) as { error: string }).error, /isn't a real date.*day first/);
  assert.match((bad({ date: "30/13/2026" }) as { error: string }).error, /isn't a real date/);
  const garbage = bad({ date: "foo bar" });
  assert.equal(garbage.ok, false);
  assert.match((garbage as { error: string }).error, /Couldn't read the date "foo bar".*5 days ago/);
  assert.match((bad({ date: "February 30 2026" }) as { error: string }).error, /isn't a real date/);
  assert.match((bad({ date: "01/01/2005" }) as { error: string }).error, /before there are any prices/);
});

test("the future is refused, not guessed", () => {
  assert.match((bad({ date: "tomorrow" }) as { error: string }).error, /hasn't happened yet/);
  assert.match((bad({ date: "20/11/2026" }) as { error: string }).error, /in the future/);
  assert.match((bad({ date: "today", time: "23:00" }) as { error: string }).error, /in the future/);
  assert.match((bad({ time: "23:00" }) as { error: string }).error, /in the future/);
});

test("bad times and contradictions", () => {
  assert.equal((bad({ date: "15/09/2026", time: "25:00" }) as { field: string }).field, "time");
  assert.equal((bad({ date: "15/09/2026", time: "13:60" }) as { field: string }).field, "time");
  assert.match((bad({ date: "15/09/2026", time: "13:40pm" }) as { error: string }).error, /mixes a 24-hour time with am\/pm/);
  assert.equal((bad({ date: "15/09/2026", time: "soon" }) as { field: string }).field, "time");
  assert.match((bad({ date: "2 hours ago", time: "13:40" }) as { error: string }).error, /contradict/);
  assert.equal((bad({ date: "15/09/2026", tz: "Narnia" }) as { field: string }).field, "tz");
});

test("time helpers", () => {
  assert.deepEqual(parseTime("1:05pm"), { hour: 13, minute: 5 });
  assert.equal(typeof parseTime("1305"), "string", "1305 alone is not accepted: it looks like a year");
  assert.deepEqual(extractTime("15/09/2026 13:40"), { time: "13:40", rest: "15/09/2026" });
  assert.deepEqual(extractTime("5 days ago"), { time: null, rest: "5 days ago" });
  assert.equal(extractTime("15.09.2026").time, null, "dots in a date are not a time");
  assert.equal(extractTime("sept 15 2026").time, null);
});

/* ---- chain prefixes ---- */

test("chain prefixes", () => {
  assert.equal(parseMarketPrefix("SOL"), "solana");
  assert.equal(parseMarketPrefix("sol"), "solana");
  assert.equal(parseMarketPrefix("ETH"), "ethereum");
  assert.equal(parseMarketPrefix("BASE"), "base");
  assert.equal(parseMarketPrefix("BNB"), "bsc");
  assert.equal(parseMarketPrefix("BSC"), "bsc");
  assert.equal(parseMarketPrefix("ARB"), "arbitrum");
  assert.equal(parseMarketPrefix("ADA"), "cardano");
  assert.equal(parseMarketPrefix("STOCK"), "equity");
  assert.equal(parseMarketPrefix("US"), "equity");
  assert.equal(parseMarketPrefix("doge"), null);
  assert.equal(parseMarketPrefix(undefined), null);
});

const SOL_ADDR = "So11111111111111111111111111111111111111112";
const EVM_ADDR = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
const POLICY = "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489";

test("the chain an address can only belong to", () => {
  assert.equal(inferChain(SOL_ADDR), "solana");
  assert.equal(inferChain(POLICY), "cardano");
  assert.equal(inferChain(POLICY + "4e4d4b52"), "cardano");
  assert.equal(inferChain(EVM_ADDR), null, "EVM addresses are shared by several chains");
  assert.equal(inferChain("AAPL"), null);
});

/* ---- the chat command: /historical-price {address} {chain} {time?} {date} ---- */

test("the bot's word order: address, chain, time, date", () => {
  const q = parseHistoricalQuery(`${SOL_ADDR} SOL 13:40 15/09/2026`);
  assert.deepEqual(q, { address: SOL_ADDR, market: "solana", date: "15/09/2026", time: "13:40", tz: "" });
});

test("the time can come after the date, and the date can be words", () => {
  assert.equal(parseHistoricalQuery(`${EVM_ADDR} ETH 15/09/2026 13:40`).time, "13:40");
  const q = parseHistoricalQuery(`${EVM_ADDR} base September 15 2026`);
  assert.equal(q.market, "base");
  assert.equal(q.date, "September 15 2026");
  assert.equal(q.time, "");
  assert.equal(parseHistoricalQuery(`${EVM_ADDR} BSC 5 days ago`).date, "5 days ago");
  assert.equal(parseHistoricalQuery(`${EVM_ADDR} ARB 5 months ago 1:40pm`).time, "1:40pm");
});

test("a timezone can end the line", () => {
  const q = parseHistoricalQuery(`${EVM_ADDR} ETH 13:40 15/09/2026 UTC+1`);
  assert.equal(q.tz, "UTC+1");
  assert.equal(q.date, "15/09/2026");
  assert.equal(parseHistoricalQuery(`${EVM_ADDR} ETH 15/09/2026 13:40 Europe/London`).tz, "Europe/London");
  assert.equal(parseHistoricalQuery(`${EVM_ADDR} ETH 15/09/2026 13:40 EST`).tz, "EST");
});

test("the chain can be left out when the address only fits one", () => {
  assert.equal(parseHistoricalQuery(`${SOL_ADDR} 15/09/2026`).market, "solana");
  assert.equal(parseHistoricalQuery(`${POLICY} 5 days ago`).market, "cardano");
  assert.equal(parseHistoricalQuery(`${SOL_ADDR} September 15`).market, "solana", "a month name is not mistaken for a chain");
  assert.equal(parseHistoricalQuery(`${SOL_ADDR} yesterday`).date, "yesterday");
  assert.equal(parseHistoricalQuery(`${SOL_ADDR} a week ago`).date, "a week ago");
});

test("an EVM address needs a chain, and an unknown chain is called out", () => {
  const noChain = parseHistoricalQuery(`${EVM_ADDR} 15/09/2026`);
  assert.equal(noChain.market, null);
  assert.match(noChain.error ?? "", /several chains.*SOL, ETH, BASE, BSC, ARB, ADA or STOCK/);
  assert.match(parseHistoricalQuery(`${EVM_ADDR} DOGE 15/09/2026`).error ?? "", /"DOGE" isn't a chain I know/);
});

test("stocks, braces and empty input", () => {
  const q = parseHistoricalQuery("AAPL STOCK 15/09/2026");
  assert.equal(q.address, "AAPL");
  assert.equal(q.market, "equity");
  assert.equal(parseHistoricalQuery(`{${EVM_ADDR}} {ETH} {13:40} {15/09/2026}`).address, EVM_ADDR);
  assert.match(parseHistoricalQuery("   ").error ?? "", /Give a contract address/);
});

test("the parts of a chat command feed straight into parseWhen", () => {
  const q = parseHistoricalQuery(`${SOL_ADDR} SOL 13:40 15/09/2026`);
  const w = ok({ date: q.date, time: q.time, tz: q.tz });
  assert.equal(iso(w.instantMs), "2026-09-15T13:40Z");
  const rel = parseHistoricalQuery(`${EVM_ADDR} ETH 5 days ago`);
  assert.equal(ok({ date: rel.date, time: rel.time, tz: rel.tz }).dateUtc, "2026-11-14");
});
