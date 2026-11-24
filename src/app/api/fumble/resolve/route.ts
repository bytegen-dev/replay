import { connection, NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";
import { resolveSol, solName } from "@/lib/fumble/sns.ts";

/**
 * The wallet behind a Solana name.
 *
 *   GET /api/fumble/resolve?name=bytegen.sol   ->   { "wallet": "<address>" }
 *
 * 400 when it is not a plain `.sol` name, 404 when there is no such name, 429 when asked too often, 503 when names cannot be looked up right now.
 */
export async function GET(request: Request) {
  await connection(); // read per request
  const headers = { "cache-control": "no-store" };
  const name = solName(new URL(request.url).searchParams.get("name") ?? "");
  if (!name) return NextResponse.json({ error: "That doesn't look like a .sol name." }, { status: 400, headers });

  const key = process.env.HELIUS_API_KEY;
  if (!key) return NextResponse.json({ error: "Names can't be looked up right now." }, { status: 503, headers });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const allowed = await hitRateLimit(`fumble-name:${hashSecret(ip).slice(0, 16)}`, 30, 60);
  if (!allowed.ok) return NextResponse.json({ error: "Too many lookups. Try again in a minute." }, { status: 429, headers: { ...headers, "retry-after": String(allowed.resetSeconds) } });

  try {
    const wallet = await resolveSol(name, { apiKey: key });
    if (!wallet) return NextResponse.json({ error: `${name}.sol isn't registered.` }, { status: 404, headers });
    return NextResponse.json({ wallet }, { headers });
  } catch (e) {
    console.error("name lookup failed:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "Names can't be looked up right now." }, { status: 503, headers });
  }
}
