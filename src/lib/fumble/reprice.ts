import { retotal } from "./hide.ts";
import type { ApiCoinPricing, ApiPosition, ApiResult, ApiSell } from "./service.ts";

/**
 * A scan with one coin priced again: that coin's sells, positions and share of the total fumble are replaced by the new ones, the lists are put back in the
 * order a scan gives them, and every total is worked out again (see `retotal`), so the page adds up as if the whole scan had priced the coin.
 */
export function mergeCoinPricing(r: ApiResult, p: ApiCoinPricing): ApiResult {
  const others = <T extends { token: string }>(list: T[]) => list.filter((x) => x.token !== p.token);
  // Measured sells first, biggest fumble first (equal ones oldest first, as the scan has them); then the ones with no price, oldest first.
  const allSells: ApiSell[] = [...others(r.sells), ...p.sells];
  const sells = [...allSells.filter((s) => s.status === "ok").sort((a, b) => b.fumbleUsd! - a.fumbleUsd! || a.soldAt - b.soldAt), ...allSells.filter((s) => s.status !== "ok").sort((a, b) => a.soldAt - b.soldAt)];
  // Measured positions first, biggest round-trip first; then the ones with no price, oldest first.
  const allPositions: ApiPosition[] = [...others(r.positions), ...p.positions];
  const positions = [...allPositions.filter((x) => x.status === "ok").sort((a, b) => b.roundTripSol! - a.roundTripSol! || a.openedAt - b.openedAt), ...allPositions.filter((x) => x.status !== "ok").sort((a, b) => a.openedAt - b.openedAt)];
  const coins = r.coins.map((c) => (c.token === p.token ? { ...c, missedSol: p.missedSol, missedUsd: p.missedUsd } : c));
  return retotal({ ...r, sells, positions, coins });
}
