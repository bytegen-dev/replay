// Downloads gold's daily closing prices (US dollars a troy ounce, gold futures "GC=F") from Yahoo Finance, keeps the last close of each
// month, and saves them as src/data/gold.json, which the footer timeline reads. Yahoo's history for gold starts in September 2000.
// Run it now and then:  node scripts/update-gold.mjs
import { writeFileSync } from "node:fs";

const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/GC=F?period1=946684800&period2=${Math.floor(Date.now() / 1000)}&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } });
if (!res.ok) throw new Error(`Yahoo: HTTP ${res.status}`);
const chart = (await res.json()).chart.result?.[0];
if (!chart) throw new Error("Yahoo sent no gold history.");

const closes = chart.indicators.quote[0].close;
// Yahoo's monthly bars for gold skip months (and asking for the longest range gives only those), so ask for days from 2000 on and
// take the last daily close in each month.
const lastClose = new Map();
chart.timestamp.forEach((t, i) => {
  const close = closes[i];
  if (typeof close !== "number") return;
  lastClose.set(new Date(t * 1000).toISOString().slice(0, 7), Math.round(close * 100) / 100);
});
const months = [...lastClose.entries()].sort((a, b) => a[0].localeCompare(b[0]));

// Stored as the first month and one price a month after it, so the file stays small. Yahoo leaves a month out now and then;
// that month is stored as null (the footer shows the nearest earlier price for it).
const byMonth = lastClose;
const [first] = months[0];
const [last] = months[months.length - 1];
const nth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};
const prices = [];
for (let n = nth(first); n <= nth(last); n++) {
  const ym = `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  prices.push(byMonth.get(ym) ?? null);
}

writeFileSync(new URL("../src/data/gold.json", import.meta.url), JSON.stringify({ start: first, prices }));
console.log(`${prices.length} months saved (${prices.filter((p) => p === null).length} without a price), ${first} to ${last}.`);
