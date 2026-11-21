import { DEFAULT_FUNDING_APR, type FundingBase } from "./leverage.ts";
import { majorFor } from "./majors.ts";
import type { Market } from "./types.ts";

/**
 * What holding a leveraged position costs by default, which depends on what is held.
 *  - Crypto (a major coin, or a token on a chain): funding charged on the whole position, 10.95% a year, the usual baseline on
 *    crypto perpetual futures (0.01% every 8 hours).
 *  - Stocks and commodities: interest on the borrowed part only, 5% a year, about the cost of borrowing to hold them. Charging
 *    10.95% on the whole position would overstate it several times over.
 * Either rate can be changed in the form or the API; only the base follows the asset.
 */
export interface FundingDefault {
  apr: number;
  base: FundingBase;
}

export const CRYPTO_FUNDING: FundingDefault = { apr: DEFAULT_FUNDING_APR, base: "position" };
export const TRADITIONAL_FUNDING: FundingDefault = { apr: 5, base: "borrowed" };

/** The default for an asset: `chain` is "equity" for stocks, commodities and the major coins (which run as Yahoo pairs). */
export function fundingDefaultFor(chain: Market, address: string): FundingDefault {
  if (chain !== "equity") return CRYPTO_FUNDING;
  return majorFor(address) ? CRYPTO_FUNDING : TRADITIONAL_FUNDING;
}

/** A sentence saying what a default charges and on what, for the form and the examples. */
export function describeFunding(apr: number, base: FundingBase): string {
  return base === "borrowed" ? `${apr}% a year on the borrowed part` : `${apr}% a year on the whole position`;
}
