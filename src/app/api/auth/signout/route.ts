import { NextResponse } from "next/server";
import { endSession, SESSION_COOKIE } from "@/lib/accounts.ts";

export async function POST(request: Request) {
  await endSession(request).catch(() => undefined);
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  return res;
}
