import { NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";
import { saveSubscriber, validEmail } from "@/lib/subscribe.ts";

/** Sign up for an email when the app gets new features. The same answer comes back whether or not the address was already saved. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const rate = await hitRateLimit(`subscribe:${hashSecret(ip).slice(0, 16)}`, 5, 600);
  if (!rate.ok) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(rate.resetSeconds) } });

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address, like name@example.com." }, { status: 400 });

  try {
    if (!(await saveSubscriber(email))) return NextResponse.json({ error: "Sign-ups are not available right now. Try again later." }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "Could not save your address. Try again shortly." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
