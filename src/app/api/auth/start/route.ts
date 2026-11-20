import { NextResponse } from "next/server";
import { AccountsUnavailable, createLoginLink, mailConfigured, normalizeEmail, sendLoginEmail } from "@/lib/accounts.ts";
import { clientIp } from "@/lib/limits.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";
import { validEmail } from "@/lib/subscribe.ts";

const noStore = { "cache-control": "no-store" };

function siteOrigin(request: Request): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Emails a one-time sign-in link. The answer is the same whether or not the address has an account. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address, like name@example.com." }, { status: 400, headers: noStore });

  const ip = hashSecret(`ip:${clientIp(request)}`).slice(0, 16);
  const [byIp, byEmail] = await Promise.all([hitRateLimit(`auth:ip:${ip}`, 10, 3600), hitRateLimit(`auth:email:${hashSecret(email).slice(0, 16)}`, 3, 600)]);
  if (!byIp.ok || !byEmail.ok) {
    const wait = Math.max(byIp.ok ? 0 : byIp.resetSeconds, byEmail.ok ? 0 : byEmail.resetSeconds);
    return NextResponse.json({ error: `Too many tries. Wait ${Math.ceil(wait / 60)} min and try again.` }, { status: 429, headers: { ...noStore, "retry-after": String(wait) } });
  }

  const production = process.env.NODE_ENV === "production";
  if (production && !mailConfigured()) return NextResponse.json({ error: "Signing in isn't set up on this site yet." }, { status: 503, headers: noStore });

  try {
    const token = await createLoginLink(email);
    const link = `${siteOrigin(request)}/signin/confirm?token=${token}`;
    const sent = await sendLoginEmail(email, link).catch(() => false);
    if (mailConfigured() && !sent) return NextResponse.json({ error: "Couldn't send the email. Try again in a moment." }, { status: 502, headers: noStore });
    // Without a mail service (local development only) the link is handed back so the flow can still be tried.
    if (!sent) {
      console.log(`[auth] sign-in link for ${email}: ${link}`);
      return NextResponse.json({ ok: true, devLink: link }, { headers: noStore });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    if (e instanceof AccountsUnavailable) return NextResponse.json({ error: e.message }, { status: 503, headers: noStore });
    console.error("auth start failed", e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500, headers: noStore });
  }
}
