import { connection, NextResponse } from "next/server";
import { leaderboard } from "@/lib/gameBoard.ts";

/**
 * The Survival board: everyone's best run, highest first.
 *
 * It reads the database, so it must run when someone asks. Without `connection()` Next prerenders this route during the build, where there is
 * no database (or an empty one), and then serves that frozen answer for a year.
 */
export async function GET() {
  await connection();
  try {
    const entries = await leaderboard(20);
    if (entries === null) return NextResponse.json({ available: false, entries: [] });
    return NextResponse.json({ available: true, entries }, { headers: { "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ available: false, entries: [] });
  }
}
