import { NextResponse } from "next/server";
import { currencyByCode, isCurrency } from "@/lib/fxCurrencies.ts";
import { runFxDca } from "@/lib/fxDca.ts";
import { getFxSeries } from "@/lib/fxSources.ts";
import { isMonth, todayUtc } from "@/lib/months.ts";
import { hitRateLimit } from "@/lib/rateLimit.ts";
import { hashSecret } from "@/lib/share.ts";

const MAX_MONTHS = 720;

/** Currency wayback: spend a fixed amount of one currency on another every month, and see what it came to. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const rate = await hitRateLimit(`web-fx:${hashSecret(ip).slice(0, 16)}`, 30, 60);
  if (!rate.ok) return NextResponse.json({ error: `Too many requests. Try again in ${rate.resetSeconds} seconds.` }, { status: 429, headers: { "retry-after": String(rate.resetSeconds) } });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });

  const fields: Record<string, string> = {};
  if (!isCurrency(body.from)) fields.from = "Choose the currency you spend";
  if (!isCurrency(body.to)) fields.to = "Choose the currency you buy";
  if (isCurrency(body.from) && isCurrency(body.to) && String(body.from).toUpperCase() === String(body.to).toUpperCase()) fields.to = "Choose two different currencies";
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) fields.amount = "Amount must be greater than 0";
  const startMonth = String(body.startMonth ?? "");
  const endMonth = String(body.endMonth ?? "");
  if (!isMonth(startMonth)) fields.startMonth = "Pick a start month";
  if (!isMonth(endMonth)) fields.endMonth = "Pick an end month";
  if (!fields.startMonth && !fields.endMonth) {
    if (startMonth > endMonth) fields.endMonth = "End month must not be before start month";
    else if ((Number(endMonth.slice(0, 4)) - Number(startMonth.slice(0, 4))) * 12 + Number(endMonth.slice(5)) - Number(startMonth.slice(5)) + 1 > MAX_MONTHS) fields.endMonth = `Range is limited to ${MAX_MONTHS / 12} years`;
  }
  if (Object.keys(fields).length) return NextResponse.json({ error: "Invalid input", fields }, { status: 400 });

  const from = String(body.from).toUpperCase();
  const to = String(body.to).toUpperCase();
  try {
    const [a, b] = await Promise.all([getFxSeries(from), getFxSeries(to)]);
    const today = todayUtc();
    const result = runFxDca({ from, to, amount, startMonth, endMonth }, a.points, b.points, today);
    const firstDate = (s: typeof a, code: string) => (code === "USD" ? null : (s.points[0]?.date ?? null));
    const sources = [...a.sources, ...b.sources].filter((s, i, all) => all.findIndex((o) => o.url === s.url) === i);
    const warnings: string[] = ["These are official or interbank rates. They can be far from the rate you could actually get on the street, and in some years that gap was large."];
    const missing = result.months - result.pricedMonths;
    if (missing > 0) warnings.push(`${missing} of ${result.months} months have no exchange rate for this pair (rate history starts ${[firstDate(a, from), firstDate(b, to)].filter(Boolean).sort().pop()}) and are left out.`);
    return NextResponse.json({
      from: { code: from, name: currencyByCode(from)!.name, symbol: currencyByCode(from)!.symbol },
      to: { code: to, name: currencyByCode(to)!.name, symbol: currencyByCode(to)!.symbol },
      amount,
      startMonth,
      endMonth,
      today,
      result,
      sources,
      warnings,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load exchange rates. Try again shortly." }, { status: 502 });
  }
}
