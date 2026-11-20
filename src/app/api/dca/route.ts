import { NextResponse } from "next/server";
import { DcaError, runDca } from "@/lib/dca.ts";
import type { LeverageSettings } from "@/lib/leverage.ts";
import type { DcaRequest } from "@/lib/types.ts";
import { isPlan } from "@/lib/plan.ts";
import { tiingoKeyFor } from "@/lib/accessStore.ts";
import { isHuman } from "@/lib/human.ts";
import { countRun, limitMessage, whoIs } from "@/lib/limits.ts";
import { isTiingoKey } from "@/lib/tiingo.ts";
import { cardanoUnit, normalizeAddress, validateRequest } from "@/lib/validate.ts";


export async function POST(request: Request) {
  // Who is asking, and whether they still have runs left today. Checked first, so a refused run costs nothing.
  const viewer = await whoIs(request);
  // Anonymous visitors also have to have passed the invisible bot check (when it is set up).
  if (viewer.kind === "anonymous" && !isHuman(request)) return NextResponse.json({ error: "Quick check needed.", code: "human_required" }, { status: 403, headers: { "cache-control": "no-store" } });
  const run = await countRun(viewer);
  if (!run.ok) {
    return NextResponse.json({ error: limitMessage(run), limit: { code: run.code, kind: run.kind, max: run.limit, resetSeconds: run.resetSeconds } }, { status: 429, headers: { "retry-after": String(run.resetSeconds ?? 60), "cache-control": "no-store" } });
  }

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

  // Leverage: only settings that were given and are valid carry through (validateRequest has already checked them).
  const lv = body.leverage as Partial<LeverageSettings> | undefined;
  const leverage: LeverageSettings | undefined =
    lv && Number(lv.leverage) > 1
      ? {
          leverage: Number(lv.leverage),
          ...(lv.side === "short" ? { side: "short" as const } : {}),
          ...(lv.fundingApr !== undefined ? { fundingApr: Number(lv.fundingApr) } : {}),
          ...(lv.topUp === true ? { topUp: true } : {}),
          ...(lv.topUpMax !== undefined ? { topUpMax: Number(lv.topUpMax) } : {}),
          ...(lv.topUpBudget !== undefined ? { topUpBudget: Number(lv.topUpBudget) } : {}),
          ...(lv.maxLoss !== undefined ? { maxLoss: Number(lv.maxLoss) } : {}),
          ...(lv.maxLossPct !== undefined ? { maxLossPct: Number(lv.maxLossPct) } : {}),
        }
      : undefined;

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
    ...(leverage ? { leverage } : {}),
    ...(body.sellAtEnd === true ? { sellAtEnd: true } : {}),
    ...(body.basis === "day-of-month" ? { basisDay: Number(body.basisDay) } : {}),
  };

  try {
    // A key the user pasted into Settings, sent only to look up their own stock prices. Never logged or stored.
    const key = request.headers.get("x-tiingo-key")?.trim();
    // Otherwise the site's own key, for a browser that entered the access code. The key stays on the server.
    const tiingoKey = isTiingoKey(key) ? key : await tiingoKeyFor(request);
    return NextResponse.json(await runDca(req, Date.now(), tiingoKey ? { tiingoKey } : {}));
  } catch (e) {
    if (e instanceof DcaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("dca route failed", e);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
