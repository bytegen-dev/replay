import { NextResponse } from "next/server";

/** The id of the build that is live, so a page that was opened earlier can tell it is out of date. */
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? "" }, { headers: { "cache-control": "no-store, max-age=0" } });
}
