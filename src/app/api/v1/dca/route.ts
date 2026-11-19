import { apiError, guarded, json, preflight } from "@/lib/apiHandler.ts";
import { paramsFromSearch, parseApiParams } from "@/lib/apiParams.ts";
import { toApiResult } from "@/lib/dcaResult.ts";
import { DcaError, runDca } from "@/lib/dca.ts";

const CODES: Record<number, string> = { 404: "not_found", 422: "unsupported", 429: "upstream_rate_limited", 502: "upstream_unavailable" };

async function run(input: Record<string, unknown>): Promise<Response> {
  const parsed = parseApiParams(input);
  if (!parsed.ok) return apiError(400, "invalid_request", "Some inputs are missing or not valid. See `fields`.", parsed.fields);
  const { request, detail } = parsed.value;
  try {
    const result = await runDca(request);
    return json(200, toApiResult(result, request, detail), { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" });
  } catch (e) {
    if (e instanceof DcaError) return apiError(e.status, CODES[e.status] ?? "error", e.message);
    console.error("v1 dca failed", e);
    return apiError(500, "internal_error", "Something went wrong on our side. Try again shortly.");
  }
}

/** GET /api/v1/dca?market=stock&asset=AAPL&amount=100&from=2013-01 */
export function GET(request: Request) {
  return guarded(request, () => run(paramsFromSearch(new URL(request.url).searchParams)));
}

/** POST /api/v1/dca with the same fields as JSON. */
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
