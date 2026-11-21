/**
 * Leveraged buying, modeled like a perpetual futures long on an exchange (Hyperliquid, Binance and the like).
 *
 * What holding costs depends on the kind of asset (see funding.ts). Crypto perps charge "funding" on the whole position, typically
 * 10.95% a year (0.01% every 8 hours). Stocks and commodities are financed like margin: interest on the borrowed part only, at about
 * the going cost of borrowing. The model supports both through `fundingBase`.
 *
 * Each buy opens its own isolated position: `amount` is the margin you put up, the position controls `amount x leverage` of the
 * asset, and the rest is borrowed from the exchange. While it is open the position pays funding (a yearly rate charged on its
 * value, quoted here the way exchanges do, 10.95% a year being the usual 0.01% every 8 hours) and a trading fee on the way in
 * and out. If the margin left falls to the maintenance level the exchange closes it (liquidation) and the margin is lost.
 * Two optional guards: topping up the margin when it gets thin, and a maximum loss per position.
 *
 * It works from daily closing prices, so it can't see an intraday wick that would liquidate a position sooner. Real
 * trading is therefore a little harsher than this, never a little kinder. Pure maths: no network, no dates but the ones passed in.
 */

export type Side = "long" | "short";

/** What the yearly funding rate is charged on: the whole position's value (a crypto perp), or only the borrowed part (margin lending). */
export type FundingBase = "position" | "borrowed";

export interface LeverageSettings {
  /** 1 to 100. 1 means no leverage. */
  leverage: number;
  /** Long gains when the price rises (the default); short gains when it falls and is liquidated when it rises. */
  side?: Side;
  /** Funding charged each year, in percent, on the base below. Default 10.95. */
  fundingApr?: number;
  /** What the rate is charged on. "position" (the default here) is the position's whole value, as a crypto perpetual does; "borrowed" is only the part that was borrowed (notional less margin), as margin lending on a stock or commodity does. */
  fundingBase?: FundingBase;
  /** Add margin when a position gets close to liquidation, to keep it at its starting leverage. */
  topUp?: boolean;
  /** The most extra margin one position may be given, in dollars. Blank means no limit. */
  topUpMax?: number;
  /** The most extra margin all the positions together may be given, in dollars. Blank means no limit. */
  topUpBudget?: number;
  /** Close a position when it has lost this many dollars (margin plus top-ups, less what is left). Blank means never. */
  maxLoss?: number;
  /** The same stop as a percent of the buy's margin (100 is all of it). If both are given, whichever is hit first applies. */
  maxLossPct?: number;
}

export interface LeverageBuy {
  month: string;
  /** The day the position opens. */
  date: string;
  price: number;
  /** Margin for this buy, in dollars. */
  amount: number;
}

export interface DailyClose {
  date: string;
  price: number;
}

export type PositionStatus = "open" | "liquidated" | "stopped";

export interface Position {
  month: string;
  openDate: string;
  openPrice: number;
  /** What the buy put up. */
  margin: number;
  /** The margin added later to avoid liquidation. */
  topUps: number;
  topUpCount: number;
  /** What the position controls at the start: margin x leverage. */
  notional: number;
  /** The price at which the position would be liquidated if nothing changed. */
  liquidationPrice: number;
  status: PositionStatus;
  closeDate: string | null;
  closePrice: number | null;
  /** Funding paid while it was open. */
  funding: number;
  /** Trading fees, in and out. */
  fees: number;
  /** What the position is worth at the end (or when it closed). Never below zero: the loss stops at the margin. */
  value: number;
}

export interface LeverageSummary {
  /** Margin plus top-ups: all the money the leveraged plan used. */
  invested: number;
  value: number;
  gain: number;
  gainPct: number | null;
  positions: number;
  liquidated: number;
  stopped: number;
  topUps: number;
  funding: number;
  fees: number;
}

/** One point of the leveraged run over time: all the money in so far and what the positions were worth that day. */
export interface LeverageSeriesPoint {
  date: string;
  invested: number;
  value: number;
  price: number;
}

export interface LeverageResult {
  settings: Required<Pick<LeverageSettings, "leverage" | "fundingApr" | "fundingBase" | "side">> & Pick<LeverageSettings, "topUp" | "topUpMax" | "topUpBudget" | "maxLoss" | "maxLossPct">;
  positions: Position[];
  summary: LeverageSummary;
  /** About one point a week, for the chart. */
  series: LeverageSeriesPoint[];
}

/** The trading fee on each side (opening and closing): 0.045%, a typical exchange taker fee. */
export const FEE_RATE = 0.00045;
/**
 * The margin that must remain, as a share of the position's value, before it is liquidated. Exchanges set it from the leverage
 * they allow (roughly half the starting margin at their maximum), so higher leverage has a lower level: 1% up to 50x, then
 * 0.5 / leverage (0.5% at 100x). It is always below the starting margin, so a fresh position is never liquidated at once.
 */
export const maintenanceRate = (leverage: number): number => Math.min(0.01, 0.5 / leverage);
export const DEFAULT_FUNDING_APR = 10.95;
export const MAX_LEVERAGE = 100;
/** Where the leverage slider starts when someone turns leverage on. */
export const DEFAULT_LEVERAGE = 25;

const DAY_MS = 86_400_000;
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** The price at which a fresh position would be liquidated: where the margin left falls to the maintenance level. A long is liquidated below its price, a short above. */
export function liquidationPrice(openPrice: number, leverage: number, side: Side = "long"): number {
  const marginShare = 1 / leverage - FEE_RATE; // margin less the opening fee, as a share of the position
  return side === "short" ? (openPrice * (1 + marginShare)) / (1 + maintenanceRate(leverage)) : (openPrice * (1 - marginShare)) / (1 - maintenanceRate(leverage));
}

/** How far the price must move against a fresh position (down for a long, up for a short) to liquidate it, in percent. */
export function liquidationDropPct(leverage: number, side: Side = "long"): number {
  return Math.abs(liquidationPrice(1, leverage, side) - 1) * 100;
}

type Full = Required<Pick<LeverageSettings, "leverage" | "fundingApr" | "fundingBase" | "side">> & LeverageSettings;

/** One position while the run is under way. */
interface Live {
  buy: LeverageBuy;
  size: number;
  notional: number;
  entryFee: number;
  margin: number;
  topUps: number;
  topUpCount: number;
  funding: number;
  status: PositionStatus;
  closeDate: string | null;
  closePrice: number | null;
  equity: number;
  prevMs: number;
  lastPrice: number;
  lastDate: string;
  exitFee: number;
  stop: number | undefined;
}

function openPosition(buy: LeverageBuy, s: Full): Live {
  const notional = buy.amount * s.leverage;
  const entryFee = FEE_RATE * notional;
  const stops = [s.maxLoss, s.maxLossPct === undefined ? undefined : (buy.amount * s.maxLossPct) / 100].filter((x): x is number => x !== undefined);
  return {
    buy,
    size: notional / buy.price,
    notional,
    entryFee,
    margin: buy.amount,
    topUps: 0,
    topUpCount: 0,
    funding: 0,
    status: "open",
    closeDate: null,
    closePrice: null,
    equity: buy.amount - entryFee,
    prevMs: dayMs(buy.date),
    lastPrice: buy.price,
    lastDate: buy.date,
    exitFee: 0,
    stop: stops.length ? Math.min(...stops) : undefined,
  };
}

/** Moves one open position through one day's close. `budgetLeft` is what the shared top-up budget still has (Infinity if none). Returns the margin added. */
function stepDay(p: Live, day: DailyClose, s: Full, budgetLeft: number): number {
  const L = s.leverage;
  const ms = dayMs(day.date);
  // Funding builds up through the days since the last price, on the position's value at this close.
  // +1 for a long, -1 for a short: it flips which way a price move pays, and funding is paid by longs and received by shorts
  // (when the rate is positive, as it usually is), so a short's funding is a credit.
  const dir = s.side === "short" ? -1 : 1;
  const years = (ms - p.prevMs) / DAY_MS / 365;
  if (s.fundingBase === "borrowed") {
    // Margin lending: interest on what was borrowed (the position less the margin put up), a cost whichever way the bet goes.
    p.funding += Math.max(0, p.notional - p.margin) * (s.fundingApr / 100) * years;
  } else {
    p.funding += dir * p.size * day.price * (s.fundingApr / 100) * years;
  }
  p.prevMs = ms;
  p.lastPrice = day.price;
  p.lastDate = day.date;
  p.equity = p.margin + dir * p.size * (day.price - p.buy.price) - p.entryFee - p.funding;
  const maintenance = maintenanceRate(L) * p.size * day.price;
  let added = 0;

  // Close to liquidation: put margin back in, enough to return to the starting leverage, if there is room for it.
  if (s.topUp && p.equity <= 2 * maintenance) {
    const room = Math.min(s.topUpMax === undefined ? Infinity : Math.max(0, s.topUpMax - p.topUps), budgetLeft);
    const want = (p.size * day.price) / L - p.equity;
    const add = Math.min(room, Math.max(0, want));
    if (add > 0) {
      p.margin += add;
      p.topUps += add;
      p.topUpCount += 1;
      p.equity += add;
      added = add;
    }
  }
  if (p.equity <= maintenance) {
    p.status = "liquidated";
    p.closeDate = day.date;
    p.closePrice = day.price;
    p.equity = 0;
  } else if (p.stop !== undefined && p.margin - p.equity >= p.stop) {
    p.status = "stopped";
    p.closeDate = day.date;
    p.closePrice = day.price;
    p.exitFee = FEE_RATE * p.size * day.price;
    p.equity -= p.exitFee;
  }
  return added;
}

function finish(p: Live, s: Full): Position {
  if (p.status === "open") {
    p.exitFee = FEE_RATE * p.size * p.lastPrice;
    p.equity -= p.exitFee;
    p.closePrice = p.lastPrice;
    p.closeDate = p.lastDate;
  }
  return {
    month: p.buy.month,
    openDate: p.buy.date,
    openPrice: p.buy.price,
    margin: p.buy.amount,
    topUps: p.topUps,
    topUpCount: p.topUpCount,
    notional: p.notional,
    liquidationPrice: liquidationPrice(p.buy.price, s.leverage, s.side),
    status: p.status,
    closeDate: p.status === "open" ? null : p.closeDate,
    closePrice: p.closePrice,
    funding: p.funding,
    fees: p.entryFee + p.exitFee,
    value: Math.max(0, p.equity),
  };
}

/**
 * Runs every buy as its own leveraged position from the day it opens to `endDate` (today, or the month it is sold), and totals them.
 * `daily` must be the asset's daily closing prices, oldest first.
 */
export function simulateLeverage(opts: { buys: LeverageBuy[]; daily: DailyClose[]; endDate: string; settings: LeverageSettings }): LeverageResult {
  const leverage = Math.min(MAX_LEVERAGE, Math.max(1, opts.settings.leverage));
  const settings = { ...opts.settings, leverage, side: opts.settings.side ?? "long", fundingApr: opts.settings.fundingApr ?? DEFAULT_FUNDING_APR, fundingBase: opts.settings.fundingBase ?? "position" } as Full;
  // The positions run side by side, day by day, so a top-up budget shared by all of them is spent in the order things happened.
  const live = opts.buys.map((b) => openPosition(b, settings));
  let spent = 0;
  const budgetLeft = () => (settings.topUpBudget === undefined ? Infinity : Math.max(0, settings.topUpBudget - spent));
  const series: LeverageSeriesPoint[] = [];
  const firstBuy = live.reduce((m, p) => (p.buy.date < m ? p.buy.date : m), "9999-99-99");
  const days = opts.daily.filter((d) => d.date <= opts.endDate);
  let sinceSample = 7;
  days.forEach((day, i) => {
    for (const p of live) {
      if (p.status !== "open" || day.date <= p.buy.date) continue;
      spent += stepDay(p, day, settings, budgetLeft());
    }
    if (day.date < firstBuy) return;
    const isBuyDay = live.some((p) => p.buy.date === day.date);
    sinceSample += 1;
    if (sinceSample >= 7 || isBuyDay || i === days.length - 1) {
      sinceSample = 0;
      let inn = 0;
      let val = 0;
      for (const p of live) {
        if (p.buy.date > day.date) continue;
        inn += p.margin;
        val += p.status === "liquidated" ? 0 : Math.max(0, p.equity);
      }
      series.push({ date: day.date, invested: inn, value: val, price: day.price });
    }
  });
  const positions = live.map((p) => finish(p, settings));
  const margin = positions.reduce((a, p) => a + p.margin, 0);
  const topUps = positions.reduce((a, p) => a + p.topUps, 0);
  const invested = margin + topUps;
  const value = positions.reduce((a, p) => a + p.value, 0);
  const gain = value - invested;
  // The chart ends on the same figures as the summary (the closing fee is taken out there).
  const tip = series[series.length - 1];
  if (tip) {
    tip.value = value;
    tip.invested = invested;
  }
  return {
    settings: { leverage, side: settings.side, fundingApr: settings.fundingApr, fundingBase: settings.fundingBase, ...(settings.topUp ? { topUp: true } : {}), ...(settings.topUpMax !== undefined ? { topUpMax: settings.topUpMax } : {}), ...(settings.topUpBudget !== undefined ? { topUpBudget: settings.topUpBudget } : {}), ...(settings.maxLoss !== undefined ? { maxLoss: settings.maxLoss } : {}), ...(settings.maxLossPct !== undefined ? { maxLossPct: settings.maxLossPct } : {}) },
    positions,
    series,
    summary: {
      invested,
      value,
      gain,
      gainPct: invested > 0 ? (gain / invested) * 100 : null,
      positions: positions.length,
      liquidated: positions.filter((p) => p.status === "liquidated").length,
      stopped: positions.filter((p) => p.status === "stopped").length,
      topUps,
      funding: positions.reduce((a, p) => a + p.funding, 0),
      fees: positions.reduce((a, p) => a + p.fees, 0),
    },
  };
}
