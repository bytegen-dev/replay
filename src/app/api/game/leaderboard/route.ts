import { NextResponse } from "next/server";
import { leaderboard } from "@/lib/gameBoard.ts";

/** The Survival board: everyone's best run, highest first. */
export async function GET() {
  try {
    const entries = await leaderboard(20);
    if (entries === null) return NextResponse.json({ available: false, entries: [] });
    return NextResponse.json({ available: true, entries }, { headers: { "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ available: false, entries: [] });
  }
}
