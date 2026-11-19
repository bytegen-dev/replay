import { apiError, CORS_HEADERS, guarded, json, preflight } from "@/lib/apiHandler.ts";
import { renderText, runHistorical } from "@/lib/historicalApi.ts";
import { paramsFromSearch } from "@/lib/apiParams.ts";

/**
 * GET  /api/v1/historical-price?market=SOL&asset=<address>&date=15/09/2026&time=13:40
 * GET  /api/v1/historical-price?q=<address> SOL 13:40 15/09/2026&format=text      (what a chat bot sends)
 * POST the same fields as JSON.
 * `format=text` returns one plain-text message instead of JSON, ready to post into a chat.
 */
async function run(input: Record<string, unknown>): Promise<Response> {
  const text = String(input.format ?? "").toLowerCase() === "text";
  const outcome = await runHistorical(input);

  if (text) {
    return new Response(renderText(outcome), {
      status: outcome.status,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": outcome.ok ? "public, max-age=0, s-maxage=60" : "no-store", ...CORS_HEADERS },
    });
  }
  if (!outcome.ok) return apiError(outcome.status, outcome.code, outcome.message, outcome.fields);
  return json(200, outcome.result, { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" });
}

export function GET(request: Request) {
  return guarded(request, () => run(paramsFromSearch(new URL(request.url).searchParams)));
}

export function POST(request: Request) {
  return guarded(request, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "invalid_json", "The request body must be JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return apiError(400, "invalid_json", "The request body must be a JSON object.");
    return run(body as Record<string, unknown>);
  });
}

export function OPTIONS() {
  return preflight();
}
