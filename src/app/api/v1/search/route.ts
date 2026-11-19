import { apiError, guarded, json, preflight } from "@/lib/apiHandler.ts";
import { getJson } from "@/lib/http.ts";
import { parseStockSearch, searchStocks } from "@/lib/stocks.ts";
import { parseSearch, type DexSearchPair } from "@/lib/tokenSearch.ts";

/** GET /api/v1/search?q=apple&type=all|stock|token : find the `market` and `asset` to use with /api/v1/dca. */
export function GET(request: Request) {
  return guarded(request, async () => {
    const sp = new URL(request.url).searchParams;
    const q = (sp.get("q") ?? "").trim();
    const type = (sp.get("type") ?? "all").toLowerCase();
    if (q.length < 1) return apiError(400, "invalid_request", "q is required.", { q: "Give a name, ticker or address to search for." });
    if (q.length > 100) return apiError(400, "invalid_request", "q is too long.", { q: "At most 100 characters." });
    if (!["all", "stock", "token"].includes(type)) return apiError(400, "invalid_request", "type must be all, stock or token.", { type: "Use all, stock or token." });

    const warnings: string[] = [];
    const [stocks, tokens] = await Promise.all([
      type === "token" ? [] : searchStocks(q).then((b) => parseStockSearch(b).map((h) => ({ market: "stock", asset: h.symbol, name: h.name, exchange: h.exchange, kind: h.type.toLowerCase() })), () => (warnings.push("Stock search is unavailable right now."), [])),
      type === "stock"
        ? []
        : getJson<{ pairs?: DexSearchPair[] | null }>(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`).then(
            (d) => parseSearch(d.pairs, q).slice(0, 10).map((t) => ({ market: t.chain, asset: t.address, name: t.name, symbol: t.symbol, priceUsd: t.priceUsd, marketCapUsd: t.marketCap, liquidityUsd: Math.round(t.liquidityUsd) })),
            () => (warnings.push("Token search is unavailable right now."), []),
          ),
    ]);
    return json(200, { query: q, stocks, tokens, warnings }, { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" });
  });
}

export function OPTIONS() {
  return preflight();
}
