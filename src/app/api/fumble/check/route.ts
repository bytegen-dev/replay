import { connection, NextResponse } from "next/server";
import { isWalletAddress } from "@/lib/fumble/helius.ts";
import { getWalletLook } from "@/lib/fumble/live.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/**
 * Does this wallet have any transactions at all?
 *
 *   GET /api/fumble/check?wallet=<address>   ->   { "status": "active" | "empty" | "unknown" }
 *
 * The page asks as soon as a valid address is typed, so an unused or mistyped wallet is turned back before a scan. "unknown" means the look
 * could not be made (no key, a busy provider, too many asks); the page lets the scan go ahead then. One small call, remembered for a while.
 */
export async function GET(request: Request) {
  await connection(); // read per request: without this the route is built once and always answers the same
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim() ?? "";
  if (!isWalletAddress(wallet)) return NextResponse.json({ error: "That doesn't look like a Solana wallet address." }, { status: 400 });
  const headers = { "cache-control": "no-store" };

  const look = getWalletLook();
  if (!look) return NextResponse.json({ status: "unknown" }, { headers });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const allowed = await hitRateLimit(`fumble-check:${hashSecret(ip).slice(0, 16)}`, 40, 60);
  if (!allowed.ok) return NextResponse.json({ status: "unknown" }, { headers });

  try {
    return NextResponse.json({ status: await look(wallet) }, { headers });
  } catch (e) {
    console.error("wallet check failed:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ status: "unknown" }, { headers });
  }
}
