import { NextResponse } from "next/server";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, accessConfigured, accessToken, checkCode, hasAccess } from "@/lib/access.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";

const noStore = { "cache-control": "no-store" };
const secure = (request: Request) => new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";

/** Whether this browser already has access, and whether there is anything to unlock at all. */
export async function GET(request: Request) {
  return NextResponse.json({ configured: accessConfigured(), granted: hasAccess(request) }, { headers: noStore });
}

/** Checks a four-digit code and, if it is right, sets the access cookie. Few tries per address, and few overall: four digits is easy to guess. */
export async function POST(request: Request) {
  if (!accessConfigured()) return NextResponse.json({ error: "Access codes are not set up on this site." }, { status: 404, headers: noStore });

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const [mine, all] = await Promise.all([hitRateLimit(`access:${client}`, 5, 900), hitRateLimit("access:all", 60, 3600)]);
  if (!mine.ok || !all.ok) {
    const wait = Math.max(mine.ok ? 0 : mine.resetSeconds, all.ok ? 0 : all.resetSeconds);
    return NextResponse.json({ error: `Too many tries. Wait ${Math.ceil(wait / 60)} min and try again.` }, { status: 429, headers: { ...noStore, "retry-after": String(wait) } });
  }

  let typed: unknown = null;
  try {
    typed = ((await request.json()) as { code?: unknown } | null)?.code;
  } catch {
    /* falls through to the wrong-code answer */
  }
  if (!checkCode(typed)) return NextResponse.json({ error: "That code isn't right." }, { status: 401, headers: noStore });

  const res = NextResponse.json({ granted: true }, { headers: noStore });
  res.cookies.set(ACCESS_COOKIE, accessToken(), { httpOnly: true, sameSite: "lax", secure: secure(request), path: "/", maxAge: ACCESS_MAX_AGE });
  return res;
}

/** Takes access away from this browser. */
export async function DELETE(request: Request) {
  const res = NextResponse.json({ granted: false }, { headers: noStore });
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: secure(request), path: "/", maxAge: 0 });
  return res;
}
