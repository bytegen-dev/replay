import { NextResponse } from "next/server";
import { runHistorical } from "@/lib/historicalApi.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

/** The price page's own endpoint: same lookup as /api/v1/historical-price, with no API key needed. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const rate = await hitRateLimit(`web-price:${hashSecret(ip).slice(0, 16)}`, 40, 60);
  if (!rate.ok) return NextResponse.json({ error: `Too many lookups. Try again in ${rate.resetSeconds} seconds.` }, { status: 429, headers: { "retry-after": String(rate.resetSeconds) } });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });

  const outcome = await runHistorical(body as Record<string, unknown>);
  if (!outcome.ok) return NextResponse.json({ error: outcome.message, fields: outcome.fields }, { status: outcome.status });
  return NextResponse.json(outcome.result);
}
