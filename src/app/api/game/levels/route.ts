import { getLevels, getSurvivalSegments } from "@/lib/gameLevels.ts";

/** The game's courses as JSON, for the box that opens the game over other pages (so those pages do not carry the data). */
export function GET() {
  return Response.json({ levels: getLevels(), segments: getSurvivalSegments() }, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
