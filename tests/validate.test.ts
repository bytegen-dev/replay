import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAddress, validateRequest } from "../src/lib/validate.ts";

test("cardano policy id: 56 hex only", () => {
  assert.equal(validateAddress("5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489", "cardano"), null);
  assert.ok(validateAddress("0x1234", "cardano"));
  assert.ok(validateAddress("5dac", "cardano"));
});

test("evm address", () => {
  const ok = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  for (const c of ["ethereum", "base", "bsc", "arbitrum"] as const) assert.equal(validateAddress(ok, c), null);
  assert.ok(validateAddress("A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "base"));
  assert.ok(validateAddress("0xZZ", "ethereum"));
});

test("solana address", () => {
  assert.equal(validateAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "solana"), null);
  assert.ok(validateAddress("0OIl", "solana"));
});

test("empty address message matches the field label for the chain", () => {
  assert.equal(validateAddress("  ", "cardano"), "Policy ID is required");
  assert.equal(validateAddress("", "ethereum"), "Contract address is required");
});

test("an address from another chain says which chain to pick", () => {
  const evm = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const policy = "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489";
  const sol = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  assert.match(validateAddress(evm, "cardano") ?? "", /EVM address.*Ethereum, Base, BSC or Arbitrum/);
  assert.match(validateAddress(evm, "solana") ?? "", /EVM address/);
  assert.match(validateAddress(policy, "base") ?? "", /Cardano policy ID.*Choose Cardano/);
  assert.match(validateAddress(sol, "cardano") ?? "", /Solana address.*Choose Solana/);
  assert.match(validateAddress(sol, "bsc") ?? "", /Choose Solana/);
});

const base = {
  address: "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489",
  chain: "cardano",
  amount: 200,
  startMonth: "2024-12",
  endMonth: "2026-10",
  basis: "month-end",
};

test("valid request has no errors", () => {
  assert.deepEqual(validateRequest(base), {});
});

test("amount must be > 0", () => {
  assert.ok(validateRequest({ ...base, amount: 0 }).amount);
  assert.ok(validateRequest({ ...base, amount: -5 }).amount);
  assert.ok(validateRequest({ ...base, amount: Number.NaN }).amount);
});

test("end before start is rejected; same month is fine", () => {
  assert.ok(validateRequest({ ...base, startMonth: "2026-10", endMonth: "2026-09" }).endMonth);
  assert.deepEqual(validateRequest({ ...base, startMonth: "2026-10", endMonth: "2026-10" }), {});
});

test("bad month format and over-long range are rejected", () => {
  assert.ok(validateRequest({ ...base, startMonth: "" }).startMonth);
  assert.ok(validateRequest({ ...base, startMonth: "2000-01", endMonth: "2026-10" }).endMonth);
});

test("day-of-month requires basisDay 1–31", () => {
  assert.deepEqual(validateRequest({ ...base, basis: "day-of-month", basisDay: 15 }), {});
  assert.ok(validateRequest({ ...base, basis: "day-of-month" }).basisDay);
  assert.ok(validateRequest({ ...base, basis: "day-of-month", basisDay: 0 }).basisDay);
  assert.ok(validateRequest({ ...base, basis: "day-of-month", basisDay: 32 }).basisDay);
});
