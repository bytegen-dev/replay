import { lastFullMonth } from "./examples.ts";
import { CHAINS, type Basis, type DcaRequest } from "./types.ts";
import { cardanoUnit, normalizeAddress, validateRequest } from "./validate.ts";

/**
 * The public API's request, in friendlier words than the internal one:
 *   market   "stock" or a chain: cardano, ethereum, solana, base, bsc, arbitrum, hyperevm
 *   asset    the ticker (stocks) or the contract / mint / Cardano policy id (tokens)
 *   amount   invested each month, in `currency` (US dollars unless currency is given)
 *   leverage optional 1 to 100: buy like a perpetual futures position (`side` long, the default, or short), with `funding` (yearly percent, default 10.95), `topup` (true adds margin near liquidation), `topupMax` (dollars per buy), `topupBudget` (dollars across all buys) and `maxLoss` (dollars per buy) or `maxLossPct` (percent of each buy)
 *   plan     optional how often to buy: monthly (default), quarterly, semiannual, yearly or once (a single buy at `from`)
 *   currency optional ISO code the amount is in (NGN, EUR, GBP ...); each buy is converted at that day's rate
 *   from     first month, YYYY-MM         to  last month, YYYY-MM (default: last full month)
 *   basis    month-end (default), first-of-month or day-of-month (with `day`)
 *   reinvest stocks only: treat dividends as reinvested
 *   detail   "summary" (default) or "full" (adds every month)
 * It reads the same fields from a JSON body or from URL query parameters.
 */
export interface ApiParams {
  request: DcaRequest;
  detail: "summary" | "full";
}

export type ParsedParams = { ok: true; value: ApiParams } | { ok: false; fields: Record<string, string> };

const BASES: Basis[] = ["month-end", "first-of-month", "day-of-month"];

/** Internal field names back to the names the API documents. */
const EXTERNAL: Record<string, string> = { chain: "market", address: "asset", startMonth: "from", endMonth: "to", basisDay: "day" };

const str = (x: unknown): string | undefined => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : undefined);
const truthy = (x: unknown) => x === true || (typeof x === "string" && ["1", "true", "yes", "on"].includes(x.toLowerCase()));

export function parseApiParams(input: Record<string, unknown>, now: number = Date.now()): ParsedParams {
  const fields: Record<string, string> = {};

  const marketRaw = (str(input.market) ?? str(input.chain) ?? "").toLowerCase();
  const market = ["stock", "stocks", "equity", "etf"].includes(marketRaw) ? "equity" : marketRaw;
  if (!market) fields.market = `market is required: "stock" or one of ${CHAINS.join(", ")}`;
  else if (market !== "equity" && !(CHAINS as readonly string[]).includes(market)) fields.market = `Unknown market "${marketRaw}". Use "stock" or one of ${CHAINS.join(", ")}`;

  const asset = str(input.asset) ?? str(input.symbol) ?? str(input.ticker) ?? str(input.address) ?? "";
  const amountRaw = str(input.amount);
  const basisRaw = (str(input.basis) ?? "month-end").toLowerCase();
  const basis = BASES.find((b) => b === basisRaw);
  if (!basis) fields.basis = `basis must be one of ${BASES.join(", ")}`;
  const day = str(input.day) ?? str(input.basisDay);
  const planRaw = (str(input.plan) ?? "monthly").toLowerCase();
  const levRaw = str(input.leverage);
  const levNum = levRaw === undefined || levRaw === "" ? undefined : Number(levRaw);
  const detailRaw = (str(input.detail) ?? "summary").toLowerCase();
  if (detailRaw !== "summary" && detailRaw !== "full") fields.detail = 'detail must be "summary" or "full"';

  const from = str(input.from) ?? str(input.startMonth) ?? "";
  const to = str(input.to) ?? str(input.endMonth) ?? lastFullMonth(now);

  // Keep going even after a problem above, so every bad input is reported in one response.
  const marketOk = market === "equity" || (CHAINS as readonly string[]).includes(market);
  const useMarket = (marketOk ? market : "equity") as DcaRequest["chain"];

  const request: DcaRequest = {
    address: useMarket === "equity" ? normalizeAddress(asset, "equity") : asset,
    chain: useMarket,
    amount: amountRaw === undefined || amountRaw === "" ? Number.NaN : Number(amountRaw),
    startMonth: from,
    endMonth: to,
    basis: basis ?? "month-end",
    ...(basis === "day-of-month" ? { basisDay: day === undefined ? Number.NaN : Number(day) } : {}),
    ...(useMarket === "equity" && truthy(input.reinvest) ? { reinvest: true } : {}),
    ...(planRaw !== "monthly" ? { plan: planRaw as DcaRequest["plan"] } : {}),
    ...(levNum !== undefined && !(levNum === 1)
      ? {
          leverage: {
            leverage: levNum,
            ...(str(input.side)?.toLowerCase() === "short" ? { side: "short" as const } : {}),
            ...(str(input.funding) !== undefined && str(input.funding) !== "" ? { fundingApr: Number(str(input.funding)) } : {}),
            ...(truthy(input.topup) ? { topUp: true } : {}),
            ...(str(input.topupMax) ? { topUpMax: Number(str(input.topupMax)) } : {}),
            ...(str(input.topupBudget) ? { topUpBudget: Number(str(input.topupBudget)) } : {}),
            ...(str(input.maxLoss) ? { maxLoss: Number(str(input.maxLoss)) } : {}),
            ...(str(input.maxLossPct) ? { maxLossPct: Number(str(input.maxLossPct)) } : {}),
          },
        }
      : {}),
    ...((str(input.currency) ?? "").toUpperCase() !== "" && (str(input.currency) ?? "").toUpperCase() !== "USD" ? { currency: (str(input.currency) ?? "").toUpperCase() } : {}),
  };

  const internal = validateRequest(request);
  for (const [key, message] of Object.entries(internal)) {
    if (!message) continue;
    // With no usable market, complaints about the asset or the market itself would only be noise.
    if (!marketOk && (key === "address" || key === "chain")) continue;
    const name = EXTERNAL[key] ?? key;
    if (!(name in fields)) fields[name] = message;
  }
  // An empty or missing value reads better as "is required" than as a format complaint.
  if (!from) fields.from = "from is required, as YYYY-MM (for example 2013-01)";
  if (!asset && marketOk) fields.asset = useMarket === "equity" ? "asset is required: a ticker such as AAPL" : "asset is required: a contract address, mint or policy id";
  if (Object.keys(fields).length) return { ok: false, fields };

  // Tokens: a pasted Cardano asset id is cut back to the policy id for lookup, with the full id kept.
  const unit = cardanoUnit(asset, request.chain);
  if (request.chain !== "equity") request.address = normalizeAddress(asset, request.chain);
  if (unit) request.unit = unit;
  return { ok: true, value: { request, detail: detailRaw as "summary" | "full" } };
}

/** Query parameters as a plain object, for `parseApiParams`. */
export function paramsFromSearch(sp: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of sp) out[k] = v;
  return out;
}
