import { NextResponse } from "next/server";
import { DcaError, runDca } from "@/lib/dca.ts";
import type { DcaRequest } from "@/lib/types.ts";
import { isPlan } from "@/lib/plan.ts";
import { isTiingoKey } from "@/lib/tiingo.ts";
import { cardanoUnit, normalizeAddress, validateRequest } from "@/lib/validate.ts";


export async function POST(request: Request) {
  let body: Partial<DcaRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const errors = validateRequest(body);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Invalid input", fields: errors }, { status: 400 });
  }

  const req: DcaRequest = {
    address: normalizeAddress(String(body.address), body.chain!),
    chain: body.chain!,
    ...(cardanoUnit(String(body.address), body.chain!) ? { unit: cardanoUnit(String(body.address), body.chain!) } : {}),
    amount: Number(body.amount),
    startMonth: String(body.startMonth),
    endMonth: String(body.endMonth),
    basis: body.basis!,
    ...(body.chain === "equity" && body.reinvest === true ? { reinvest: true } : {}),
    ...(typeof body.currency === "string" && body.currency.trim() !== "" && body.currency.trim().toUpperCase() !== "USD" ? { currency: body.currency.trim().toUpperCase() } : {}),
    ...(isPlan(body.plan) && body.plan !== "monthly" ? { plan: body.plan } : {}),
    ...(body.basis === "day-of-month" ? { basisDay: Number(body.basisDay) } : {}),
  };

  try {
    // A key the user pasted into Settings, sent only to look up their own stock prices. Never logged or stored.
    const key = request.headers.get("x-tiingo-key")?.trim();
    return NextResponse.json(await runDca(req, Date.now(), isTiingoKey(key) ? { tiingoKey: key } : {}));
  } catch (e) {
    if (e instanceof DcaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("dca route failed", e);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
