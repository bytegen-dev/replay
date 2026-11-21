// Saves the real price histories behind the Tony Stonk game as src/data/gameLevels.json, so the game ships its courses as plain data
// (no network while someone plays). It uses the same price code as the rest of the site (Yahoo, then Nasdaq for stocks; Bitstamp for
// Bitcoin and Ethereum). Run it now and then to bring the Survival run up to the latest day:
//   node --experimental-strip-types scripts/update-game-levels.mjs
// An entry that can't be fetched right now keeps its previous data.
import { readFileSync, writeFileSync } from "node:fs";
import { getStockHistory } from "../src/lib/stocks.ts";

const file = new URL("../src/data/gameLevels.json", import.meta.url);
let saved = { tutorial: {}, survival: {} };
try {
  saved = JSON.parse(readFileSync(file, "utf8"));
  saved.tutorial ??= {};
  saved.survival ??= {};
} catch {
  /* first run */
}

/** The simulator runs: short, fixed stretches of real history. */
const TUTORIAL = [
  { id: "first-steps", symbol: "SPY", from: "2017-01-03", to: "2017-12-29" },
  { id: "the-drop", symbol: "SPY", from: "2020-02-14", to: "2020-04-30" },
  { id: "rocket-fuel", symbol: "GME", from: "2021-01-04", to: "2021-02-26" },
];

/** The Survival run: these assets, from 2018 up to the latest day, one after another. */
const SURVIVAL = [
  { id: "btc", symbol: "BTC-USD", from: "2018-01-01" },
  { id: "eth", symbol: "ETH-USD", from: "2018-01-01" },
  { id: "spy", symbol: "SPY", from: "2018-01-02" },
  { id: "nvda", symbol: "NVDA", from: "2018-01-02" },
  { id: "tsla", symbol: "TSLA", from: "2018-01-02" },
];

const MAX_POINTS = 220;

/** At most MAX_POINTS points, keeping the first, the last, the highest and the lowest so the shape and its extremes survive. */
function thin(days, max) {
  if (days.length <= max) return days;
  const keep = new Set([0, days.length - 1]);
  let hi = 0;
  let lo = 0;
  days.forEach((d, i) => {
    if (d.close > days[hi].close) hi = i;
    if (d.close < days[lo].close) lo = i;
  });
  keep.add(hi);
  keep.add(lo);
  const step = (days.length - 1) / (max - keep.size);
  for (let x = 0; x < days.length; x += step) keep.add(Math.round(x));
  return [...keep].sort((a, b) => a - b).map((i) => days[i]);
}

async function run(list, bucket, max) {
  for (const lv of list) {
    try {
      const { days } = await getStockHistory(lv.symbol);
      const last = days[days.length - 1].date;
      const to = lv.to ?? last;
      const slice = days.filter((d) => d.date >= lv.from && d.date <= to);
      if (slice.length < 20) throw new Error(`only ${slice.length} days between ${lv.from} and ${to}`);
      const pts = thin(slice, max);
      saved[bucket][lv.id] = { symbol: lv.symbol, from: slice[0].date, to: slice[slice.length - 1].date, points: pts.map((d) => [Date.parse(`${d.date}T00:00:00Z`), Math.round(d.close * 100) / 100]) };
      console.log(`ok       ${bucket}/${lv.id}: ${lv.symbol} ${slice[0].date} to ${slice[slice.length - 1].date}, ${slice.length} days kept as ${pts.length} points`);
    } catch (e) {
      console.log(`skipped  ${bucket}/${lv.id}: ${e instanceof Error ? e.message : e}${saved[bucket][lv.id] ? " (kept the saved one)" : ""}`);
    }
  }
}

await run(TUTORIAL, "tutorial", 150);
await run(SURVIVAL, "survival", MAX_POINTS);
writeFileSync(file, JSON.stringify({ tutorial: Object.fromEntries(Object.entries(saved.tutorial).filter(([k]) => TUTORIAL.some((t) => t.id === k))), survival: Object.fromEntries(Object.entries(saved.survival).filter(([k]) => SURVIVAL.some((t) => t.id === k))) }));
console.log("saved");
