import { CORS_HEADERS, preflight } from "@/lib/apiHandler.ts";
import { openApiSpec } from "@/lib/openapi.ts";

/** GET /api/v1/openapi.json : the machine-readable description of the API. */
export function GET(request: Request) {
  return new Response(JSON.stringify(openApiSpec(new URL(request.url).origin), null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600", ...CORS_HEADERS },
  });
}

export function OPTIONS() {
  return preflight();
}
