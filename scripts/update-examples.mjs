// Works out every ready-made check ahead of time and saves the results in src/data/exampleResults.json, so the page can show an
// answer the moment an example is clicked (it then refreshes from live prices in the background).
// Run it now and then:  node --experimental-strip-types scripts/update-examples.mjs
// An example that can't be worked out right now (a source is refusing, or the history is too short) keeps its previous result.
import { readFileSync, writeFileSync } from "node:fs";
import { runDca } from "../src/lib/dca.ts";
import { EXAMPLES, exampleRequest } from "../src/lib/examples.ts";

const file = new URL("../src/data/exampleResults.json", import.meta.url);
let saved = {};
try {
  saved = JSON.parse(readFileSync(file, "utf8"));
} catch {
  /* first run */
}
const today = new Date().toISOString().slice(0, 10);

for (const ex of EXAMPLES) {
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
for (const id of Object.keys(saved)) if (!EXAMPLES.some((e) => e.id === id)) delete saved[id];
writeFileSync(file, JSON.stringify(saved));
console.log(`saved ${Object.keys(saved).length} results`);
