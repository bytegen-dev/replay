/**
 * Leveraged buying, modeled like a perpetual futures long on an exchange (Hyperliquid, Binance and the like).
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

export interface LeverageSettings {
  /** 1 to 100. 1 means no leverage. */
  leverage: number;
  /** Funding charged on the position's value, as a yearly rate in percent. Default 10.95. */
  fundingApr?: number;
  /** Add margin when a position gets close to liquidation, to keep it at its starting leverage. */
  topUp?: boolean;
  /** The most extra margin one position may be given, in dollars. Blank means no limit. */
  topUpMax?: number;
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

export interface LeverageResult {
  settings: Required<Pick<LeverageSettings, "leverage" | "fundingApr">> & Pick<LeverageSettings, "topUp" | "topUpMax" | "maxLoss" | "maxLossPct">;
  positions: Position[];
  summary: LeverageSummary;
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

/** The price at which a fresh position would be liquidated: where the margin left falls to the maintenance level. */
export function liquidationPrice(openPrice: number, leverage: number): number {
  const marginShare = 1 / leverage - FEE_RATE; // margin less the opening fee, as a share of the position
  return (openPrice * (1 - marginShare)) / (1 - maintenanceRate(leverage));
}

/** How far the price must fall from the buy for a fresh position to be liquidated, in percent. */
export function liquidationDropPct(leverage: number): number {
  return (1 - liquidationPrice(1, leverage)) * 100;
}

function simulateOne(buy: LeverageBuy, daily: DailyClose[], endDate: string, s: Required<Pick<LeverageSettings, "leverage" | "fundingApr">> & LeverageSettings): Position {
  const L = s.leverage;
  const notional = buy.amount * L;
  const size = notional / buy.price;
  const entryFee = FEE_RATE * notional;
  let margin = buy.amount;
  let topUps = 0;
  let topUpCount = 0;
  let funding = 0;
  let status: PositionStatus = "open";
  let closeDate: string | null = null;
  let closePrice: number | null = null;
  let equity = margin - entryFee;
  let prevMs = dayMs(buy.date);
  let lastPrice = buy.price;
  let lastDate = buy.date;
  let exitFee = 0;
  const stops = [s.maxLoss, s.maxLossPct === undefined ? undefined : (buy.amount * s.maxLossPct) / 100].filter((x): x is number => x !== undefined);
  const stop = stops.length ? Math.min(...stops) : undefined;

  for (const day of daily) {
    if (day.date <= buy.date) continue;
    if (day.date > endDate) break;
    const ms = dayMs(day.date);
    // Funding builds up through the days since the last price, on the position's value at this close.
    funding += size * day.price * (s.fundingApr / 100) * ((ms - prevMs) / DAY_MS / 365);
    prevMs = ms;
    lastPrice = day.price;
    lastDate = day.date;
    equity = margin + size * (day.price - buy.price) - entryFee - funding;
    const maintenance = maintenanceRate(L) * size * day.price;

    // Close to liquidation: put margin back in, enough to return to the starting leverage, if there is room for it.
    if (s.topUp && equity <= 2 * maintenance) {
      const room = s.topUpMax === undefined ? Infinity : Math.max(0, s.topUpMax - topUps);
      const want = (size * day.price) / L - equity;
      const add = Math.min(room, Math.max(0, want));
      if (add > 0) {
        margin += add;
        topUps += add;
        topUpCount += 1;
        equity += add;
      }
    }
    if (equity <= maintenance) {
      status = "liquidated";
      closeDate = day.date;
      closePrice = day.price;
      equity = 0;
      break;
    }
    if (stop !== undefined && margin - equity >= stop) {
      status = "stopped";
      closeDate = day.date;
      closePrice = day.price;
      exitFee = FEE_RATE * size * day.price;
      equity -= exitFee;
      break;
    }
  }

  if (status === "open") {
    exitFee = FEE_RATE * size * lastPrice;
    equity -= exitFee;
    closePrice = lastPrice;
    closeDate = lastDate;
  }
  const value = Math.max(0, equity);
  return {
    month: buy.month,
    openDate: buy.date,
    openPrice: buy.price,
    margin: buy.amount,
    topUps,
    topUpCount,
    notional,
    liquidationPrice: liquidationPrice(buy.price, L),
    status,
    closeDate: status === "open" ? null : closeDate,
    closePrice,
    funding,
    fees: entryFee + exitFee,
    value,
  };
}

/**
 * Runs every buy as its own leveraged position from the day it opens to `endDate` (today, or the month it is sold), and totals them.
 * `daily` must be the asset's daily closing prices, oldest first.
 */
export function simulateLeverage(opts: { buys: LeverageBuy[]; daily: DailyClose[]; endDate: string; settings: LeverageSettings }): LeverageResult {
  const leverage = Math.min(MAX_LEVERAGE, Math.max(1, opts.settings.leverage));
  const settings = { ...opts.settings, leverage, fundingApr: opts.settings.fundingApr ?? DEFAULT_FUNDING_APR };
  const positions = opts.buys.map((b) => simulateOne(b, opts.daily, opts.endDate, settings));
  const margin = positions.reduce((a, p) => a + p.margin, 0);
  const topUps = positions.reduce((a, p) => a + p.topUps, 0);
  const invested = margin + topUps;
  const value = positions.reduce((a, p) => a + p.value, 0);
  const gain = value - invested;
  return {
    settings: { leverage, fundingApr: settings.fundingApr, ...(settings.topUp ? { topUp: true } : {}), ...(settings.topUpMax !== undefined ? { topUpMax: settings.topUpMax } : {}), ...(settings.maxLoss !== undefined ? { maxLoss: settings.maxLoss } : {}), ...(settings.maxLossPct !== undefined ? { maxLossPct: settings.maxLossPct } : {}) },
    positions,
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
