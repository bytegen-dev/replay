import type { ApiPosition, ApiResult, ApiSell } from "./service.ts";

/**
 * The moments of a scan worth showing on their own (the share picture, the recap video): the best trade, the biggest fumble, and the worst roundtrip.
 * Each takes the scan result, so a result with some coins hidden (see hide.ts) gives the moments of what is left. Each is null when there is none.
 */

/**
 * The best trade: the coin with the most profit kept, over all its sells traced to a buy. Null when no coin made a profit. The dollar amount is
 * there only when every one of its sells has a dollar price. A coin's sells are one trade for this: the profit of the position, not of one sell.
 */
export function bestTrade(r: ApiResult): { token: string; profitSol: number; profitUsd: number | null } | null {
  const byCoin = new Map<string, { profitSol: number; profitUsd: number | null }>();
  for (const x of r.sells) {
    if (x.matchedTokens <= 0) continue;
    const cur = byCoin.get(x.token) ?? { profitSol: 0, profitUsd: 0 };
    cur.profitSol += x.profitSol;
    cur.profitUsd = cur.profitUsd !== null && x.profitUsd !== undefined ? cur.profitUsd + x.profitUsd : null;
    byCoin.set(x.token, cur);
  }
  let best: { token: string; profitSol: number; profitUsd: number | null } | null = null;
  for (const [token, v] of byCoin) if (v.profitSol > 0 && v.profitSol > (best?.profitSol ?? 0)) best = { token, ...v };
  return best;
}

/** The biggest fumble that was measured (the sell after which the coin went furthest above the sale price, in dollars), or null when none was. */
export function worstFumble(r: ApiResult): ApiSell | null {
  let worst: ApiSell | null = null;
  for (const s of r.sells) if (s.status === "ok" && (s.fumbleUsd ?? 0) > (worst?.fumbleUsd ?? 0)) worst = s;
  return worst;
}

/** The worst roundtrip: the closed position that gave back the most profit (peak profit minus what was kept, in SOL), or null when none gave anything back. */
export function worstRoundtrip(r: ApiResult): ApiPosition | null {
  let worst: ApiPosition | null = null;
  for (const p of r.positions) if (p.status === "ok" && (p.roundTripSol ?? 0) > (worst?.roundTripSol ?? 0)) worst = p;
  return worst;
}
