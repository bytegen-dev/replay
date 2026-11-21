import saved from "../data/exampleResults.json" with { type: "json" };
import type { DcaResponse } from "./types.ts";

/** A ready-made check's result, worked out ahead of time (see scripts/update-examples.mjs), so clicking it shows an answer at once. */
export interface ExampleSnapshot {
  /** The day it was worked out, YYYY-MM-DD. */
  asOf: string;
  response: DcaResponse;
}

export const exampleSnapshot = (id: string): ExampleSnapshot | null => ((saved as unknown as Record<string, ExampleSnapshot>)[id] ?? null);
