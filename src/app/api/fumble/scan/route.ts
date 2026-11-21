import { NextResponse } from "next/server";
import { isWalletAddress } from "@/lib/fumble/helius.ts";
import { getScanner } from "@/lib/fumble/live.ts";
import { BusyError } from "@/lib/fumble/service.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/** A scan reads a wallet's history and prices every token it sold, which takes up to a minute on a busy wallet. */
export const maxDuration = 60;

/**
 * Scan a Solana wallet for fumbles.
 *
 *   POST { "wallet": "<address>" }
 *
 * Problems with the request come back as ordinary JSON errors (400 bad address, 429 too many scans, 503 not set up). A scan that
 * starts answers 200 with a stream of newline-separated JSON events:
 *
 *   {"type":"progress","stage":"history"|"prices"|"done","done":2,"total":9}
 *   {"type":"trades","data":{...}}                    the wallet's trades (see ApiTrades), as soon as the history is read
 *   {"type":"result","cached":false,"data":{...}}     the finished scan: the same trades plus every sell's fumble (see ApiResult)
 *   {"type":"error","message":"..."}                  the scan failed or the server is busy; try again shortly
 *
 * Finished scans are reused for 20 minutes, so asking again is free and does not count against the limit.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { wallet?: unknown } | null;
  const wallet = typeof body?.wallet === "string" ? body.wallet.trim() : "";
  if (!isWalletAddress(wallet)) return NextResponse.json({ error: "That doesn't look like a Solana wallet address." }, { status: 400 });

  const scanner = getScanner();
  if (!scanner) return NextResponse.json({ error: "The fumble scanner isn't set up yet." }, { status: 503 });

  // Only a scan that has to do real work costs anything, so only that counts against the limits.
  if (!scanner.peek(wallet)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const perPerson = await hitRateLimit(`fumble:${hashSecret(ip).slice(0, 16)}`, 6, 600);
    if (!perPerson.ok) return NextResponse.json({ error: "You've scanned a lot of wallets. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(perPerson.resetSeconds) } });
    const everyone = await hitRateLimit("fumble:all", 150, 3600);
    if (!everyone.ok) return NextResponse.json({ error: "Lots of people are scanning right now. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(everyone.resetSeconds) } });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The reader may have gone away (closed the tab); the scan carries on and its result is kept for the next request.
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* nobody is listening */
        }
      };
      try {
        const { result, cached } = await scanner.scan(wallet, send);
        send({ type: "result", cached, data: result });
      } catch (e) {
        if (!(e instanceof BusyError)) console.error("fumble scan failed:", e instanceof Error ? e.message : "unknown error");
        send({ type: "error", message: e instanceof BusyError ? "Lots of scans are running. Try again in a minute." : "The scan failed. Try again shortly." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
