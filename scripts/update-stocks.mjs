// Downloads the list of US-listed stocks and ETFs from Nasdaq Trader's public symbol directory and saves it as
// src/data/stocks.json, so the ticker search can answer from a local file instead of asking Yahoo every time.
// Run it now and then:  node scripts/update-stocks.mjs
import { writeFileSync } from "node:fs";

const BASE = "https://www.nasdaqtrader.com/dynamic/SymDir";
const EXCHANGES = { A: "NYSE American", N: "NYSE", P: "NYSE Arca", Z: "Cboe BZX", V: "IEX" };

async function table(file) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const [header, ...rows] = (await res.text()).split(/\r?\n/);
  const cols = header.split("|");
  return rows.filter((r) => r && !r.startsWith("File Creation Time")).map((r) => Object.fromEntries(r.split("|").map((v, i) => [cols[i], v])));
}

const clean = (n) =>
  n
    .replace(/\s+-\s+(Common Stock|Class [A-Z] Common Stock|Ordinary Shares.*|American Depositary Shares.*|Common Shares.*|Units?.*|Warrants?.*|Depositary Shares.*|Class [A-Z] Ordinary Shares.*)$/i, "")
    .replace(/\s+(New\s+)?(Common Stock|Common Shares|Ordinary Shares)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);

const out = new Map();
const add = (symbol, name, exchange, etf) => {
  // Yahoo writes share classes with a dash (BRK-B); the exchanges use a dot.
  const s = symbol.replace(/\./g, "-");
  // Skip warrants, rights, units and preferreds that look like "ABC$" or contain "^" or spaces.
  if (!/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(s) || out.has(s)) return;
  out.set(s, [s, clean(name), exchange, etf ? 1 : 0]);
};

for (const r of await table("nasdaqlisted.txt")) if (r["Test Issue"] === "N" && r["NextShares"] !== "Y") add(r["Symbol"], r["Security Name"], "NASDAQ", r["ETF"] === "Y");
for (const r of await table("otherlisted.txt")) if (r["Test Issue"] === "N") add(r["ACT Symbol"], r["Security Name"], EXCHANGES[r["Exchange"]] ?? "US", r["ETF"] === "Y");

const list = [...out.values()].sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(new URL("../src/data/stocks.json", import.meta.url), JSON.stringify(list));
console.log(`${list.length} symbols saved (${list.filter((x) => x[3]).length} ETFs).`);
