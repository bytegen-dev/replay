import { NextResponse } from "next/server";
import { limitsFor, whoIs } from "@/lib/limits.ts";
import { mailConfigured, userFor } from "@/lib/accounts.ts";

/** Who this browser is (anonymous, signed in, or trusted by an access code) and what its daily allowance is. */
export async function GET(request: Request) {
  const viewer = await whoIs(request).catch(() => ({ kind: "anonymous" as const, id: "" }));
  let email: string | null = null;
  if (viewer.kind === "user") {
    email = (await userFor(request).catch(() => null))?.email ?? null;
  }
  return NextResponse.json({ kind: viewer.kind, email, dayLimit: limitsFor(viewer.kind).day, canSignIn: process.env.NODE_ENV !== "production" || mailConfigured() }, { headers: { "cache-control": "no-store" } });
}
