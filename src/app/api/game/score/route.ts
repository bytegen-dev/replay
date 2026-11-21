import { NextResponse } from "next/server";
import { plausibleScore, saveScore, validToken, validUsername } from "@/lib/gameBoard.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/** Save a finished Survival run to the board. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const rate = await hitRateLimit(`game-score:${hashSecret(ip).slice(0, 16)}`, 30, 600);
  if (!rate.ok) return NextResponse.json({ error: "Too many runs too quickly. Wait a few minutes." }, { status: 429, headers: { "retry-after": String(rate.resetSeconds) } });

  const b = (await request.json().catch(() => null)) as { username?: unknown; token?: unknown; score?: unknown; durationMs?: unknown; asset?: unknown; reached?: unknown } | null;
  const username = typeof b?.username === "string" ? b.username.trim() : "";
  if (!validUsername(username) || !validToken(b?.token)) return NextResponse.json({ error: "Not signed in to the board." }, { status: 400 });
  const score = Number(b?.score);
  const durationMs = Number(b?.durationMs);
  if (!plausibleScore(score, durationMs)) return NextResponse.json({ error: "That score doesn't add up, so it wasn't saved." }, { status: 422 });

  try {
    const r = await saveScore({ username, token: b.token as string, score, durationMs, asset: typeof b?.asset === "string" ? b.asset : "", reached: typeof b?.reached === "string" ? b.reached : "" });
    if (!r.ok) return NextResponse.json(r.reason === "offline" ? { offline: true } : { error: "That name belongs to someone else." }, { status: r.reason === "offline" ? 503 : 403 });
    return NextResponse.json({ ok: true, rank: r.rank, best: r.best });
  } catch {
    return NextResponse.json({ error: "Could not save your run. Try again shortly." }, { status: 502 });
  }
}
