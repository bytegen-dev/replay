import type { ScannedPosition, ScannedSell } from "./scan.ts";

/**
 * The total fumble: the money a wallet did not make on coins it traded, in SOL and in dollars. It is the upside missed after selling plus the profit
 * given back while holding, but never the same coin's money twice.
 *
 * The two measures look at the same tokens at different times. A closed position's round-trip is its peak profit while held minus what was kept; the
 * fumble of its sells is how much higher the price went after each sale. Both are "what these tokens could have made, over what they made", so
 * adding them would count the same tokens twice (a coin that peaked at 10x while held, was sold at 3x and then went to 20x would be counted
 * as (10 - 3) + (20 - 3) = 24, when the most it could have made over the sale price is 20 - 3 = 17). So for each closed position the larger of the two is
 * counted. A sell that belongs to no closed position (a position still open, or one whose buys are not in the history) counts its fumble alone.
 *
 * Only measured figures count: a sell or position with no price history adds nothing, as in each total on its own.
 */
export function missedTotals(sells: ScannedSell[], positions: ScannedPosition[]): { sol: number; usd: number } {
  const positionOf = new Map<string, number>();
  positions.forEach((p, i) => {
    for (const t of p.position.trades) if (t.side === "sell") positionOf.set(t.signature, i);
  });

  const fumbles = positions.map(() => ({ sol: 0, usd: 0 }));
  let sol = 0;
  let usd = 0;
  for (const s of sells) {
    if (s.fumble.status !== "ok") continue;
    const i = positionOf.get(s.lot.sell.signature);
    if (i === undefined) {
      sol += s.fumble.fumbleSol;
      usd += s.fumble.fumbleUsd;
    } else {
      fumbles[i].sol += s.fumble.fumbleSol;
      fumbles[i].usd += s.fumble.fumbleUsd;
    }
  }
  positions.forEach((p, i) => {
    const trip = p.roundTrip.status === "ok" ? { sol: p.roundTrip.roundTripSol, usd: p.roundTrip.roundTripUsd } : { sol: 0, usd: 0 };
    const pick = trip.sol > fumbles[i].sol ? trip : fumbles[i];
    sol += pick.sol;
    usd += pick.usd;
  });
  return { sol, usd };
}
