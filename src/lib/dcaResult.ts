import { describePlan } from "./plan.ts";
import { isMajorSymbol } from "./majors.ts";
import { fmtNum, fmtPct, fmtUsd } from "./format.ts";
import { buildBuys, chooseDecimals, summarize } from "./math.ts";
import { compressMonths } from "./months.ts";
import type { LeverageResult } from "./leverage.ts";
import type { DcaRequest, DcaResponse } from "./types.ts";

/** What the public API returns: the numbers, a ready-to-quote sentence, and (with detail=full) every month. */
export interface ApiResult {
  /** One plain-English sentence with the answer. Safe to quote. */
  answer: string;
  request: {
    market: string;
    asset: string;
    amountPerMonth: number;
    from: string;
    to: string;
    basis: string;
    reinvestDividends?: boolean;
  };
  asset: { market: string; symbol: string | null; name: string | null; address: string };
  summary: {
    totalMonths: number;
    pricedMonths: number;
    skippedMonths: number;
    skippedMonthsList: string[];
    /** The same months as runs, e.g. "1998-01 to 2012-11". Easier to read aloud. */
    skippedMonthRanges: string[];
    totalInvested: number;
    /** Shares for stocks, tokens for crypto. */
    unitsBought: number;
    unit: "shares" | "tokens";
    averageBuyPrice: number | null;
    priceToday: number | null;
    priceTodayDate: string;
    valueToday: number | null;
    gain: number | null;
    /** Percent, e.g. 25.4 means +25.4%. */
    gainPercent: number | null;
  };
  months?: {
    month: string;
    priceDate: string | null;
    price: number | null;
    invested: number;
    units: number | null;
    valueToday: number | null;
    source: string;
    notes: string[];
  }[];
  /** Present when `leverage` was asked for: the same buys as leveraged futures-style positions. */
  leverage?: {
    settings: LeverageResult["settings"];
    summary: LeverageResult["summary"];
    /** Only with detail=full. */
    positions?: LeverageResult["positions"];
  };
  sources: { label: string; url: string }[];
  warnings: string[];
}

const round = (x: number | null, d = 6): number | null => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** The sentence, in plain text. Mirrors the one on the page. */
export function describeResult(opts: { plan?: DcaRequest["plan"]; amountText?: string; amount: number; symbol: string; unit: "shares" | "tokens"; priced: number; total: number; skipped: number; invested: number; units: number; decimals: number; valueToday: number | null; gain: number | null; gainPct: number | null }): string {
  if (opts.priced === 0) return "No month has a price, so there is nothing to total.";
  const bought = opts.unit === "shares" ? `${fmtNum(opts.units, opts.decimals)} shares of ${opts.symbol}` : `${fmtNum(opts.units, opts.decimals)} ${opts.symbol}`;
  let s = `${describePlan(opts.plan, opts.amountText ?? fmtUsd(opts.amount), opts.priced, opts.total, opts.skipped)} bought ${bought} for ${fmtUsd(opts.invested)}.`;
  if (opts.valueToday !== null && opts.gain !== null) {
    s += ` Today that is worth ${fmtUsd(opts.valueToday)}, a ${opts.gain < 0 ? "loss" : "gain"} of ${fmtUsd(Math.abs(opts.gain))} (${fmtPct(opts.gainPct)}).`;
  }
  return s;
}

export function toApiResult(res: DcaResponse, req: DcaRequest, detail: "summary" | "full"): ApiResult {
  const decimals = chooseDecimals(res.rows, req.amount);
  const buys = buildBuys(res.rows, req.amount, res.currentPrice, {}, decimals, req.plan);
  const s = summarize(buys, res.currentPrice);
  const unit = res.chain === "equity" && !isMajorSymbol(res.address) ? "shares" : "tokens";
  const symbol = res.token.symbol?.replace(/^\$/, "").toUpperCase() ?? res.token.name ?? "units";
  const market = res.chain === "equity" ? (isMajorSymbol(res.address) ? "crypto" : "stock") : res.chain;

  const out: ApiResult = {
    answer: describeResult({ plan: req.plan, amountText: res.currency ? `${res.currency.symbol}${fmtNum(req.amount, req.amount % 1 === 0 ? 0 : 2)}` : undefined, amount: req.amount, symbol, unit, priced: s.pricedMonths, total: req.plan && req.plan !== "monthly" ? buys.filter((b) => b.buy !== false).length : buys.length, skipped: s.skippedMonths, invested: s.invested, units: s.tokens, decimals, valueToday: s.valueToday, gain: s.gain, gainPct: s.gainPct }),
    request: {
      market,
      asset: res.address,
      amountPerMonth: req.amount,
      ...(res.currency ? { currency: res.currency.code } : {}),
      from: req.startMonth,
      to: req.endMonth,
      basis: res.basis,
      ...(res.chain === "equity" ? { reinvestDividends: res.reinvest === true } : {}),
    },
    asset: { market, symbol: res.token.symbol, name: res.token.name, address: res.address },
    summary: {
      totalMonths: buys.length,
      pricedMonths: s.pricedMonths,
      skippedMonths: s.skippedMonths,
      skippedMonthsList: s.skipped,
      skippedMonthRanges: compressMonths(s.skipped),
      totalInvested: round(s.invested, 2) ?? 0,
      unitsBought: round(s.tokens, decimals) ?? 0,
      unit,
      averageBuyPrice: round(s.avgPrice),
      priceToday: round(s.priceToday),
      priceTodayDate: res.currentPriceDate,
      valueToday: round(s.valueToday, 2),
      gain: round(s.gain, 2),
      gainPercent: round(s.gainPct, 2),
    },
    sources: res.sources,
    warnings: res.warnings,
  };
  if (res.leverage) {
    const lv = res.leverage;
    out.leverage = { settings: lv.settings, summary: lv.summary, ...(detail === "full" ? { positions: lv.positions } : {}) };
    out.answer += ` With ${lv.settings.leverage}x leverage (futures style, ${lv.settings.fundingApr}% a year funding) the same buys would have put in ${fmtUsd(lv.summary.invested)} and ended at ${fmtUsd(lv.summary.value)} (${fmtPct(lv.summary.gainPct)}), with ${lv.summary.liquidated} of ${lv.summary.positions} positions liquidated.`;
  }
  if (detail === "full") {
    out.months = buys.map((b) => ({
      month: b.month,
      priceDate: b.priceDate,
      price: round(b.price),
      invested: round(b.amount, 2) ?? 0,
      units: round(b.tokens, decimals),
      valueToday: round(b.valueToday, 2),
      source: b.source,
      notes: b.notes.map((n) => n.text),
    }));
  }
  return out;
}
