import { NextResponse } from "next/server";
import { loadAdminData, StoreUnavailable } from "@/lib/accessStore.ts";
import { isAdmin } from "@/lib/adminAuth.ts";

const noStore = { "cache-control": "no-store" };

/** Everything the admin page shows: the subscriber list, the Tiingo keys (never their values) and the access codes. */
export async function GET(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  try {
    return NextResponse.json(await loadAdminData(), { headers: noStore });
  } catch (e) {
    if (e instanceof StoreUnavailable) return NextResponse.json({ error: e.message }, { status: 503, headers: noStore });
    console.error("admin data failed", e);
    return NextResponse.json({ error: "Could not load the data." }, { status: 500, headers: noStore });
  }
}
