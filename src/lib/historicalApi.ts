import { DcaError } from "./errors.ts";
import { defaultProviders, historicalPrice, type HistoricalPriceResult, type PriceProviders } from "./historicalPrice.ts";
import type { Market } from "./types.ts";
import { cardanoUnit, normalizeAddress, validateAddress } from "./validate.ts";
import { inferChain, parseHistoricalQuery, parseMarketPrefix, parseTime, parseWhen, PREFIX_HELP } from "./when.ts";

/**
 * The request side of the historical-price feature, shared by the public API, the page's own endpoint and tests.
 *
 * It takes either named fields:  market (a chain prefix), asset (address or ticker), date, time, tz
 * or one line of text, the way a chat command arrives:  q = "<address> SOL 13:40 15/09/2026"
 * Named fields win over the same part of `q`. Every problem is reported at once, by field.
 */

export type HistoricalOutcome =
  | { ok: true; status: 200; result: HistoricalPriceResult }
  | { ok: false; status: number; code: string; message: string; fields?: Record<string, string> };

const CODES: Record<number, string> = { 404: "not_found", 422: "unsupported", 429: "upstream_rate_limited", 502: "upstream_unavailable" };
export const errorCodeFor = (status: number) => CODES[status] ?? "error";

const answers = new Map<string, { at: number; result: HistoricalPriceResult }>();

/** Test hook. */
export function clearHistoricalAnswers(): void {
  answers.clear();
}

const str = (x: unknown): string =>(typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");

export async function runHistorical(input: Record<string, unknown>, nowMs: number = Date.now(), providers: PriceProviders = defaultProviders): Promise<HistoricalOutcome> {
  const fields: Record<string, string> = {};

  // Start from the one-line form, then let any named field override its part.
  const q = str(input.q) || str(input.query) || str(input.text);
  const parsed = q ? parseHistoricalQuery(q) : null;
  if (parsed?.error) fields[/chain|several chains/.test(parsed.error) ? "market" : "q"] = parsed.error;

  const address = str(input.asset) || str(input.address) || str(input.contract) || str(input.token) || str(input.symbol) || str(input.ticker) || parsed?.address || "";
  const marketText = str(input.market) || str(input.chain) || str(input.prefix);
  let market: Market | null = marketText ? parseMarketPrefix(marketText) : (parsed?.market ?? null);
  if (marketText && !market) fields.market = `"${marketText}" isn't a chain I know. Use ${PREFIX_HELP}.`;
  if (!market && !marketText && address && !fields.market) market = inferChain(address);
  if (!market && !fields.market) fields.market = address && /^0x/i.test(address) ? `That address works on several chains. Say which one: ${PREFIX_HELP}.` : `market is required: ${PREFIX_HELP}.`;

  if (!address) fields.asset = "asset is required: a contract address, mint or Cardano policy id, or a stock ticker.";
  else if (market) {
    const bad = validateAddress(address, market);
    if (bad) fields.asset = bad;
  }

  const dateText = str(input.date) || parsed?.date || "";
  const timeText = str(input.time) || parsed?.time || "";
  const tzText = str(input.tz) || str(input.timezone) || parsed?.tz || "";
  const when = parseWhen({ date: dateText, time: timeText, tz: tzText }, nowMs);
  if (!when.ok) {
    fields[when.field] = when.error;
    // The first problem found isn't always the only one: check each part on its own too, so one reply lists them all.
    if (!fields.tz && tzText) {
      const z = parseWhen({ tz: tzText }, nowMs);
      if (!z.ok && z.field === "tz") fields.tz = z.error;
    }
    if (!fields.time && timeText) {
      const t = parseTime(timeText);
      if (typeof t === "string") fields.time = t;
    }
    if (!fields.date && dateText) {
      const d = parseWhen({ date: dateText }, nowMs);
      if (!d.ok && d.field === "date") fields.date = d.error;
    }
  }

  if (Object.keys(fields).length || !market || !when.ok) {
    return { ok: false, status: 400, code: "invalid_request", message: Object.values(fields)[0] ?? "Some inputs are missing or not valid.", fields };
  }

  // A price from the past never changes, so repeat questions (a bot's most popular tokens) are answered from memory.
  // Only with the real sources: tests that swap in fakes must not share answers.
  const key = `${market}|${normalizeAddress(address, market).toLowerCase()}|${when.value.instantMs}|${when.value.precision}`;
  const useCache = providers === defaultProviders;
  const ageMs = nowMs - when.value.instantMs;
  const ttl = when.value.isNow ? 60_000 : ageMs > 2 * 86_400_000 ? 6 * 3_600_000 : 10 * 60_000;
  const hit = useCache ? answers.get(key) : undefined;
  if (hit && Date.now() - hit.at < ttl) return { ok: true, status: 200, result: hit.result };

  try {
    const result = await historicalPrice({ market, address: normalizeAddress(address, market), when: when.value, unit: cardanoUnit(address, market) }, nowMs, providers);
    if (useCache) {
      answers.set(key, { at: Date.now(), result });
      if (answers.size > 500) answers.delete(answers.keys().next().value as string);
    }
    return { ok: true, status: 200, result };
  } catch (e) {
    if (e instanceof DcaError) return { ok: false, status: e.status, code: errorCodeFor(e.status), message: e.message };
    console.error("historical price failed", e);
    return { ok: false, status: 500, code: "internal_error", message: "Something went wrong on our side. Try again shortly." };
  }
}

/** The chat-friendly rendering: the sentence, the source, and any caveats, as plain text. */
export function renderText(o: HistoricalOutcome): string {
  if (!o.ok) return `${o.message}${o.fields && Object.keys(o.fields).length > 1 ? `\n${Object.values(o.fields).slice(1).join("\n")}` : ""}`;
  const r = o.result;
  const lines = [r.answer];
  if (r.when.assumptions.length) lines.push(...r.when.assumptions.map((a) => `Note: ${a}`));
  lines.push(`Source: ${r.source.label} (${r.price.resolution})`);
  for (const w of r.warnings) lines.push(`Note: ${w}`);
  return lines.join("\n");
}
