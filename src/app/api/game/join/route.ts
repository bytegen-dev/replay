import { NextResponse } from "next/server";
import { claimName, validToken, validUsername } from "@/lib/gameBoard.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/** Claim a Survival name. The browser sends the name and its own secret token; a returning player with the same token gets in again. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const rate = await hitRateLimit(`game-join:${hashSecret(ip).slice(0, 16)}`, 20, 600);
  if (!rate.ok) return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429, headers: { "retry-after": String(rate.resetSeconds) } });

  const body = (await request.json().catch(() => null)) as { username?: unknown; token?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (!validUsername(username)) return NextResponse.json({ error: "Use 3 to 16 letters, numbers, dashes or underscores. Some names are reserved." }, { status: 400 });
  if (!validToken(body?.token)) return NextResponse.json({ error: "Something went wrong with your device key. Reload and try again." }, { status: 400 });

  try {
    const claim = await claimName(username, body.token);
    if (claim === "taken") return NextResponse.json({ error: "That name is taken. Try another." }, { status: 409 });
    if (claim === "offline") return NextResponse.json({ offline: true }, { status: 503 });
    return NextResponse.json({ ok: true, username });
  } catch {
    return NextResponse.json({ error: "Could not reach the board. Try again shortly." }, { status: 502 });
  }
}
