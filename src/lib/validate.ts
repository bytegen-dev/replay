import { MAX_LEVERAGE } from "./leverage.ts";
import { isPlan, PLANS } from "./plan.ts";
import { isCurrency } from "./fxCurrencies.ts";
import { isMonth } from "./months.ts";
import { CHAINS, type Chain, type DcaRequest, type Market } from "./types.ts";

export const MAX_MONTHS = 72;
/** Stocks have decades of history, so they get a much longer range. */
export const MAX_MONTHS_EQUITY = 480;
export const maxMonthsFor = (market: Market) => (market === "equity" ? MAX_MONTHS_EQUITY : MAX_MONTHS);

/** A listed ticker: letters and digits, with . or - for share classes (BRK-B, BF.B). No indexes or futures. */
const TICKER_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/;

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
// A policy ID is 56 hex characters. The full asset ID ("unit") appends the token name in hex (up to 32 bytes).
const CARDANO_POLICY_RE = /^[0-9a-fA-F]{56}(?:[0-9a-fA-F]{2}){0,32}$/;
const POLICY_LEN = 56;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type AddressKind = "evm" | "cardano" | "solana";

function detectKind(a: string): AddressKind | null {
  if (EVM_RE.test(a)) return "evm";
  if (CARDANO_POLICY_RE.test(a)) return "cardano";
  if (SOLANA_RE.test(a)) return "solana";
  return null;
}

const kindOf = (chain: Chain): AddressKind => (chain === "cardano" ? "cardano" : chain === "solana" ? "solana" : "evm");

const WRONG_CHAIN_HINT: Record<AddressKind, string> = {
  evm: "That looks like an EVM address. Choose Ethereum, Base, BSC, Arbitrum or Hyperliquid.",
  cardano: "That looks like a Cardano policy ID. Choose Cardano.",
  solana: "That looks like a Solana address. Choose Solana.",
};

/**
 * The form we send to the price providers. Cardano: a pasted asset ID (policy + token name) is cut
 * back to the lowercase 56-character policy ID, the only form CoinGecko looks up. Others: trimmed.
 */
export function normalizeAddress(address: string, chain: Market): string {
  const a = address.trim();
  if (chain === "equity") return a.toUpperCase();
  return chain === "cardano" && CARDANO_POLICY_RE.test(a) ? a.slice(0, POLICY_LEN).toLowerCase() : a;
}

/** The full Cardano asset id (lowercase) when the user pasted policy + token name, otherwise undefined. */
export function cardanoUnit(address: string, chain: Market): string | undefined {
  const a = address.trim();
  return chain === "cardano" && a.length > POLICY_LEN && CARDANO_POLICY_RE.test(a) ? a.toLowerCase() : undefined;
}

export function validateAddress(address: string, chain: Market): string | null {
  const a = address.trim();
  if (chain === "equity") {
    if (!a) return "Ticker is required";
    return TICKER_RE.test(a) ? null : "Enter a ticker like AAPL or BRK-B";
  }
  if (!a) return chain === "cardano" ? "Policy ID is required" : "Contract address is required";
  const detected = detectKind(a);
  if (detected && detected !== kindOf(chain)) return WRONG_CHAIN_HINT[detected];
  switch (chain) {
    case "cardano":
      return CARDANO_POLICY_RE.test(a) ? null : "Enter the 56-character policy ID (the token name in hex may follow it)";
    case "solana":
      return SOLANA_RE.test(a) ? null : "Solana address must be 32-44 base58 characters";
    default:
      return EVM_RE.test(a) ? null : "Address must be 0x followed by 40 hex characters";
  }
}

export type FieldErrors = Partial<
  Record<"address" | "chain" | "amount" | "currency" | "plan" | "leverage" | "startMonth" | "endMonth" | "basis" | "basisDay", string>
>;

export function validateRequest(input: Partial<Record<keyof DcaRequest, unknown>>): FieldErrors {
  const errors: FieldErrors = {};
  const chain = input.chain as Market;
  if (chain !== "equity" && !CHAINS.includes(chain)) errors.chain = "Choose a supported chain";
  else if (typeof input.address !== "string") errors.address = chain === "equity" ? "Ticker is required" : "Contract address is required";
  else {
    const e = validateAddress(input.address, chain);
    if (e) errors.address = e;
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Amount must be greater than 0";
  if (input.currency !== undefined && input.currency !== "" && !isCurrency(input.currency)) errors.currency = `Unknown currency "${String(input.currency)}". Use a three-letter code such as USD, EUR or NGN.`;

  if (input.plan !== undefined && input.plan !== "" && !isPlan(input.plan)) errors.plan = `plan must be one of ${PLANS.map((p) => p.value).join(", ")}`;

  if (input.leverage !== undefined) {
    const lv = input.leverage as { leverage?: unknown; fundingApr?: unknown; topUpMax?: unknown; topUpBudget?: unknown; maxLoss?: unknown; maxLossPct?: unknown; side?: unknown } | null;
    const x = Number(lv?.leverage);
    if (!lv || typeof lv !== "object" || !Number.isFinite(x) || x < 1 || x > MAX_LEVERAGE) errors.leverage = `Leverage must be between 1 and ${MAX_LEVERAGE}`;
    else if (lv.side !== undefined && lv.side !== "long" && lv.side !== "short") errors.leverage = "side must be long or short";
    else if (lv.fundingApr !== undefined && !(Number.isFinite(Number(lv.fundingApr)) && Number(lv.fundingApr) >= 0 && Number(lv.fundingApr) <= 500)) errors.leverage = "Funding must be a yearly rate between 0 and 500 percent";
    else if (lv.topUpMax !== undefined && !(Number.isFinite(Number(lv.topUpMax)) && Number(lv.topUpMax) > 0)) errors.leverage = "The most margin to add must be more than 0";
    else if (lv.topUpBudget !== undefined && !(Number.isFinite(Number(lv.topUpBudget)) && Number(lv.topUpBudget) > 0)) errors.leverage = "The margin budget must be more than 0";
    else if (lv.maxLoss !== undefined && !(Number.isFinite(Number(lv.maxLoss)) && Number(lv.maxLoss) > 0)) errors.leverage = "The stop loss must be more than 0";
    else if (lv.maxLossPct !== undefined && !(Number.isFinite(Number(lv.maxLossPct)) && Number(lv.maxLossPct) > 0)) errors.leverage = "The stop loss percent must be more than 0";
  }

  const s = String(input.startMonth ?? "");
  const e = String(input.endMonth ?? "");
  if (!isMonth(s)) errors.startMonth = "Pick a start month";
  if (!isMonth(e)) errors.endMonth = "Pick an end month";
  if (!errors.startMonth && !errors.endMonth) {
    if (s > e) errors.endMonth = "End month must not be before start month";
    else {
      const months = (Number(e.slice(0, 4)) - Number(s.slice(0, 4))) * 12 + Number(e.slice(5)) - Number(s.slice(5)) + 1;
      const max = maxMonthsFor(chain);
      if (months > max) errors.endMonth = `Range is limited to ${max} months`;
    }
  }

  const basis = input.basis;
  if (basis !== "month-end" && basis !== "first-of-month" && basis !== "day-of-month") {
    errors.basis = "Choose a price basis";
  } else if (basis === "day-of-month") {
    const day = Number(input.basisDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) errors.basisDay = "Pick a day from 1 to 31";
  }
  return errors;
}
