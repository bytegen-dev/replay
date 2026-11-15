import { NextResponse } from "next/server";
import { DcaError, runDca } from "@/lib/dca.ts";
import type { DcaRequest } from "@/lib/types.ts";
import { validateRequest } from "@/lib/validate.ts";


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
    address: String(body.address).trim(),
    chain: body.chain!,
    amount: Number(body.amount),
    startMonth: String(body.startMonth),
    endMonth: String(body.endMonth),
    basis: body.basis!,
    ...(body.basis === "day-of-month" ? { basisDay: Number(body.basisDay) } : {}),
  };

  try {
    return NextResponse.json(await runDca(req));
  } catch (e) {
    if (e instanceof DcaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("dca route failed", e);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
