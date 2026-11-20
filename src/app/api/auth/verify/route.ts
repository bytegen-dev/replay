import { NextResponse } from "next/server";
import { AccountsUnavailable, redeemLoginLink, SESSION_COOKIE, SESSION_DAYS } from "@/lib/accounts.ts";
import { clientIp } from "@/lib/limits.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

const noStore = { "cache-control": "no-store" };

/** Turns a sign-in link's token into a session. A POST from the confirm page, so an email scanner opening the link can't use it up. */
export async function POST(request: Request) {
  const rate = await hitRateLimit(`auth:verify:${hashSecret(`ip:${clientIp(request)}`).slice(0, 16)}`, 20, 900);
  if (!rate.ok) return NextResponse.json({ error: "Too many tries. Try again in a few minutes." }, { status: 429, headers: noStore });
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  try {
    const made = typeof body?.token === "string" ? await redeemLoginLink(body.token) : null;
    if (!made) return NextResponse.json({ error: "That link has expired or was already used. Ask for a new one." }, { status: 400, headers: noStore });
    const res = NextResponse.json({ ok: true, email: made.user.email }, { headers: noStore });
    const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
    res.cookies.set(SESSION_COOKIE, made.session, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_DAYS * 86_400 });
    return res;
  } catch (e) {
    if (e instanceof AccountsUnavailable) return NextResponse.json({ error: e.message }, { status: 503, headers: noStore });
    console.error("auth verify failed", e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500, headers: noStore });
  }
}
