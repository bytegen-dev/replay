import { isMonth } from "./months.ts";
import { CHAINS, type Chain, type DcaRequest } from "./types.ts";

export const MAX_MONTHS = 72;

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
  evm: "That looks like an EVM address. Choose Ethereum, Base, BSC or Arbitrum.",
  cardano: "That looks like a Cardano policy ID. Choose Cardano.",
  solana: "That looks like a Solana address. Choose Solana.",
};

/**
 * The form we send to the price providers. Cardano: a pasted asset ID (policy + token name) is cut
 * back to the lowercase 56-character policy ID, the only form CoinGecko looks up. Others: trimmed.
 */
export function normalizeAddress(address: string, chain: Chain): string {
  const a = address.trim();
  return chain === "cardano" && CARDANO_POLICY_RE.test(a) ? a.slice(0, POLICY_LEN).toLowerCase() : a;
}

/** The full Cardano asset id (lowercase) when the user pasted policy + token name, otherwise undefined. */
export function cardanoUnit(address: string, chain: Chain): string | undefined {
  const a = address.trim();
  return chain === "cardano" && a.length > POLICY_LEN && CARDANO_POLICY_RE.test(a) ? a.toLowerCase() : undefined;
}

export function validateAddress(address: string, chain: Chain): string | null {
  const a = address.trim();
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
  Record<"address" | "chain" | "amount" | "startMonth" | "endMonth" | "basis" | "basisDay", string>
>;

export function validateRequest(input: Partial<Record<keyof DcaRequest, unknown>>): FieldErrors {
  const errors: FieldErrors = {};
  const chain = input.chain as Chain;
  if (!CHAINS.includes(chain)) errors.chain = "Choose a supported chain";
  else if (typeof input.address !== "string") errors.address = "Contract address is required";
  else {
    const e = validateAddress(input.address, chain);
    if (e) errors.address = e;
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Amount must be greater than 0";

  const s = String(input.startMonth ?? "");
  const e = String(input.endMonth ?? "");
  if (!isMonth(s)) errors.startMonth = "Pick a start month";
  if (!isMonth(e)) errors.endMonth = "Pick an end month";
  if (!errors.startMonth && !errors.endMonth) {
    if (s > e) errors.endMonth = "End month must not be before start month";
    else {
      const months = (Number(e.slice(0, 4)) - Number(s.slice(0, 4))) * 12 + Number(e.slice(5)) - Number(s.slice(5)) + 1;
      if (months > MAX_MONTHS) errors.endMonth = `Range is limited to ${MAX_MONTHS} months`;
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
