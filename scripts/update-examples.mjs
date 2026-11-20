// Works out every ready-made check ahead of time and saves the results in src/data/exampleResults.json, so the page can show an
// answer the moment an example is clicked (it then refreshes from live prices in the background).
// Run it now and then:  node --experimental-strip-types scripts/update-examples.mjs
// An example that can't be worked out right now (a source is refusing, or the history is too short) keeps its previous result.
import { readFileSync, writeFileSync } from "node:fs";
import { runDca } from "../src/lib/dca.ts";
import { EXAMPLES, FX_EXAMPLES, HERO_CHECKS, exampleRequest, lastFullMonth } from "../src/lib/examples.ts";
import { runFxDca } from "../src/lib/fxDca.ts";
import { getFxSeries } from "../src/lib/fxSources.ts";

const file = new URL("../src/data/exampleResults.json", import.meta.url);
let saved = {};
try {
  saved = JSON.parse(readFileSync(file, "utf8"));
} catch {
  /* first run */
}
const today = new Date().toISOString().slice(0, 10);

const ALL = [...EXAMPLES, ...HERO_CHECKS];
for (const ex of ALL) {
  try {
    const response = await runDca(exampleRequest(ex));
    const priced = response.rows.filter((r) => r.price !== null).length;
    // Mostly "n/a" means a source only reached part of the way back: not worth showing as the answer.
    if (priced < response.rows.length * 0.9) throw new Error(`only ${priced} of ${response.rows.length} months have a price`);
    saved[ex.id] = { asOf: today, response };
    console.log(`ok       ${ex.id} (${priced} priced months, from ${response.sources[0]?.label ?? "?"})`);
  } catch (e) {
    console.log(`skipped  ${ex.id}: ${e instanceof Error ? e.message : e}${saved[ex.id] ? " (kept the saved one)" : ""}`);
  }
}
for (const id of Object.keys(saved)) if (!ALL.some((e) => e.id === id)) delete saved[id];
writeFileSync(file, JSON.stringify(saved));
console.log(`saved ${Object.keys(saved).length} results`);

// Currency examples use the currency calculator and are saved in their own file.
const fxFile = new URL("../src/data/fxExampleResults.json", import.meta.url);
let fxSaved = {};
try {
  fxSaved = JSON.parse(readFileSync(fxFile, "utf8"));
} catch {
  /* first run */
}
for (const ex of FX_EXAMPLES) {
  try {
    const other = await getFxSeries(ex.to);
    const result = runFxDca({ from: "USD", to: ex.to, amount: ex.amount, startMonth: ex.startMonth, endMonth: lastFullMonth() }, [], other.points, today);
    if (result.pricedMonths < result.months * 0.9) throw new Error(`only ${result.pricedMonths} of ${result.months} months have a rate`);
    fxSaved[ex.id] = { asOf: today, result };
    console.log(`ok       ${ex.id} (${result.pricedMonths} priced months)`);
  } catch (e) {
    console.log(`skipped  ${ex.id}: ${e instanceof Error ? e.message : e}${fxSaved[ex.id] ? " (kept the saved one)" : ""}`);
  }
}
for (const id of Object.keys(fxSaved)) if (!FX_EXAMPLES.some((e) => e.id === id)) delete fxSaved[id];
writeFileSync(fxFile, JSON.stringify(fxSaved));
console.log(`saved ${Object.keys(fxSaved).length} currency results`);
