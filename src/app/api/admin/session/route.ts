import { NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_MAX_AGE, adminConfigured, adminToken, checkAdminPassword, isAdmin } from "@/lib/adminAuth.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";

const noStore = { "cache-control": "no-store" };
const secure = (request: Request) => new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
const cookie = { httpOnly: true, sameSite: "strict" as const, path: "/" };

/** Whether the admin page is set up, and whether this browser is signed in. */
export async function GET(request: Request) {
  return NextResponse.json({ configured: adminConfigured(), signedIn: isAdmin(request) }, { headers: noStore });
}

/** Signs in with the admin password. Few tries per address and few overall. */
export async function POST(request: Request) {
  if (!adminConfigured()) return NextResponse.json({ error: "The admin page is not set up. Set ADMIN_PASSWORD (8 or more characters)." }, { status: 404, headers: noStore });
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const [mine, all] = await Promise.all([hitRateLimit(`admin:${client}`, 5, 900), hitRateLimit("admin:all", 30, 3600)]);
  if (!mine.ok || !all.ok) {
    const wait = Math.max(mine.ok ? 0 : mine.resetSeconds, all.ok ? 0 : all.resetSeconds);
    return NextResponse.json({ error: `Too many tries. Wait ${Math.ceil(wait / 60)} min and try again.` }, { status: 429, headers: { ...noStore, "retry-after": String(wait) } });
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (!checkAdminPassword(body?.password)) return NextResponse.json({ error: "That password isn't right." }, { status: 401, headers: noStore });
  const res = NextResponse.json({ signedIn: true }, { headers: noStore });
  res.cookies.set(ADMIN_COOKIE, adminToken(), { ...cookie, secure: secure(request), maxAge: ADMIN_MAX_AGE });
  return res;
}

export async function DELETE(request: Request) {
  const res = NextResponse.json({ signedIn: false }, { headers: noStore });
  res.cookies.set(ADMIN_COOKIE, "", { ...cookie, secure: secure(request), maxAge: 0 });
  return res;
}
