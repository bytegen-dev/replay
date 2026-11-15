import { NextResponse } from "next/server";
import { loadTokenInfo } from "@/lib/tokenInfoSource.ts";
import { CHAINS, type Chain } from "@/lib/types.ts";
import { normalizeAddress, validateAddress } from "@/lib/validate.ts";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const chain = q.get("chain") as Chain;
  const raw = q.get("address") ?? "";
  if (!CHAINS.includes(chain)) return NextResponse.json({ error: "Choose a supported chain" }, { status: 400 });
  const invalid = validateAddress(raw, chain);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const address = normalizeAddress(raw, chain);
  try {
    const info = await loadTokenInfo(chain, address);
    if (!info) return NextResponse.json({ error: "No details found for this address." }, { status: 404 });
    return NextResponse.json({ address, info }, { headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (e) {
    console.error("token-info failed", e);
    return NextResponse.json({ error: "Couldn't load token details." }, { status: 502 });
  }
}
