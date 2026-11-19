import { guarded, json, preflight } from "@/lib/apiHandler.ts";
import { EXAMPLES, exampleRequest, PRICE_EXAMPLES } from "@/lib/examples.ts";
import { PREFIX_FOR } from "@/lib/when.ts";

/** GET /api/v1/examples : ready-made questions, each with the exact call that answers it. */
export function GET(request: Request) {
  return guarded(request, async () => {
    const origin = new URL(request.url).origin;
    const examples = EXAMPLES.map((ex) => {
      const r = exampleRequest(ex);
      const qs = new URLSearchParams({
        market: ex.market === "equity" ? "stock" : ex.market,
        asset: ex.address,
        amount: String(ex.amount),
        from: ex.startMonth,
        to: r.endMonth,
        ...(ex.reinvest ? { reinvest: "true" } : {}),
      });
      return { id: ex.id, question: ex.question, note: ex.note ?? null, call: { method: "GET", url: `${origin}/api/v1/dca?${qs}` } };
    });
    const priceExamples = PRICE_EXAMPLES.map((ex) => {
      const line = [ex.address, PREFIX_FOR[ex.market], ex.time, ex.date].filter(Boolean).join(" ");
      return { id: ex.id, label: ex.label, command: `/historical-price ${line}`, call: { method: "GET", url: `${origin}/api/v1/historical-price?${new URLSearchParams({ q: line, format: "text" })}` } };
    });
    return json(200, { examples, priceExamples }, { "cache-control": "public, max-age=0, s-maxage=3600" });
  });
}

export function OPTIONS() {
  return preflight();
}
