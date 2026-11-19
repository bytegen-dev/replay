const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/;
const MONTH = 60 * 60 * 24 * 30;

/** Logos already fetched, kept in memory so each is asked for once per server run. null means the source has none. */
const memory = new Map<string, { body: ArrayBuffer; type: string } | null>();

/**
 * A company logo by ticker, relayed from Financial Modeling Prep's public images. The source sends no cache headers, so every
 * dropdown opening refetched every logo; this serves them with a month-long cache instead, and the visitor's browser never
 * contacts the logo host.
 */
export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("s") ?? "").trim().toUpperCase();
  if (!SYMBOL.test(symbol)) return new Response("Bad ticker", { status: 400 });

  let hit = memory.get(symbol);
  if (hit === undefined) {
    try {
      const res = await fetch(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`, { signal: AbortSignal.timeout(8000) });
      const type = res.headers.get("content-type") ?? "";
      hit = res.ok && type.startsWith("image/") ? { body: await res.arrayBuffer(), type } : res.status === 404 ? null : undefined;
      if (hit !== undefined) memory.set(symbol, hit);
    } catch {
      hit = undefined;
    }
  }
  if (!hit) {
    // No logo (cache that for a day) or the source is down (don't cache, try again soon).
    return new Response(null, { status: hit === null ? 404 : 502, headers: { "cache-control": hit === null ? "public, max-age=86400" : "no-store" } });
  }
  return new Response(hit.body, { headers: { "content-type": hit.type, "cache-control": `public, max-age=${MONTH}, s-maxage=${MONTH}, immutable` } });
}
