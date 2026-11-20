import { NextResponse } from "next/server";
import { HUMAN_COOKIE, HUMAN_MAX_AGE, humanRequired, humanToken, isHuman, verifyTurnstile } from "@/lib/human.ts";
import { clientIp } from "@/lib/limits.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

const noStore = { "cache-control": "no-store" };

/** Whether a check is needed at all, and whether this browser already passed it. */
export async function GET(request: Request) {
  return NextResponse.json({ required: humanRequired(), passed: isHuman(request), siteKey: humanRequired() ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY : null }, { headers: noStore });
}

/** Checks a Turnstile token and, if it is real, sets the pass cookie. */
export async function POST(request: Request) {
  if (!humanRequired()) return NextResponse.json({ ok: true }, { headers: noStore });
  const ip = clientIp(request);
  const rate = await hitRateLimit(`human:${hashSecret(`ip:${ip}`).slice(0, 16)}`, 15, 600);
  if (!rate.ok) return NextResponse.json({ error: "Too many tries. Try again in a few minutes." }, { status: 429, headers: noStore });
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== "string" || !(await verifyTurnstile(body.token, ip))) return NextResponse.json({ error: "The check didn't pass. Reload the page and try again." }, { status: 403, headers: noStore });
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
  res.cookies.set(HUMAN_COOKIE, humanToken(), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: HUMAN_MAX_AGE });
  return res;
}
