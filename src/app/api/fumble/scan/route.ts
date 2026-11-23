import { NextResponse } from "next/server";
import { isWalletAddress } from "@/lib/fumble/helius.ts";
import { getScanner, getWalletLook } from "@/lib/fumble/live.ts";
import { BusyError } from "@/lib/fumble/service.ts";
import { PER_LOAD_CHOICES } from "@/lib/fumble/settings.ts";
import { isHuman } from "@/lib/human.ts";
import { whoIs } from "@/lib/limits.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/** A scan reads a wallet's history and prices every token it sold, which takes up to a minute on a busy wallet. */
export const maxDuration = 60;

/**
 * Scan a Solana wallet for fumbles.
 *
 *   POST { "wallet": "<address>", "more": true }     "more" is optional: read further back than the saved history reaches (see ApiTrades.coverage.extendable)
 *
 * Problems with the request come back as ordinary JSON errors (400 bad address, 403 with code "human_required" when the quick bot check must be passed
 * first (see /api/human), 422 a wallet with no transactions, 429 too many scans, 503 not set up). A scan that
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
  const body = (await request.json().catch(() => null)) as { wallet?: unknown; more?: unknown; limit?: unknown } | null;
  const wallet = typeof body?.wallet === "string" ? body.wallet.trim() : "";
  if (!isWalletAddress(wallet)) return NextResponse.json({ error: "That doesn't look like a Solana wallet address." }, { status: 400 });

  // "more" reads further back into a wallet whose history was only read part of the way: it is new work, so it never takes a cached scan.
  const more = body?.more === true;
  // How many trades to read at a time: one of the sizes the page offers, anything else means the default.
  const target = PER_LOAD_CHOICES.find((n) => n === body?.limit);
  const scanner = getScanner();
  if (!scanner) return NextResponse.json({ error: "The fumble scanner isn't set up yet." }, { status: 503 });

  // Only a scan that has to do real work costs anything, so only that is checked and counted: a finished scan being opened again is free.
  if (more || target !== undefined || !scanner.peek(wallet)) {
    // Anonymous visitors have to have passed the invisible bot check first (when it is set up). It is the cheapest test, so it comes first.
    const viewer = await whoIs(request);
    if (viewer.kind === "anonymous" && !isHuman(request)) return NextResponse.json({ error: "Quick check needed.", code: "human_required" }, { status: 403, headers: { "cache-control": "no-store" } });

    // A wallet with no transactions is turned back before anything is spent on it: no scan slot, no turn against the limits, no history read. The
    // page has usually asked already, and the answer is remembered, so this costs no extra call then. A look that could not be made lets the scan go ahead.
    if (!more) {
      const status = await getWalletLook()?.(wallet).catch(() => null);
      if (status === "empty") return NextResponse.json({ error: "No transactions found for this wallet." }, { status: 422 });
    }

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
        const { result, cached } = await scanner.scan(wallet, send, { more, target });
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
