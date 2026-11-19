/**
 * Reading "the price at a moment" off a list of candles.
 *
 * The rule: the price at a moment is where the market stood at that moment, which is the close of the last candle
 * that had finished by then. If a candle is still in progress at that moment, its open is the better guess. If
 * nothing has traded for a while, that last price still stands, and the answer says how old it is.
 */

export interface Candle {
  /** Start of the candle, seconds since the epoch (UTC). */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Volume in USD, when the source gives it. */
  volume?: number;
}

export type Basis =
  /** The last candle ended exactly when (or just before) the moment: its close is the price. */
  | "close-before"
  /** The moment fell inside a candle: its open is used. */
  | "open-of-candle"
  /** The moment is the present: the newest candle's close. */
  | "latest"
  /** Nothing traded since: the last known close, some time earlier. */
  | "carried-forward";

export interface Pick {
  priceUsd: number;
  /** The candle the price came from. */
  candle: Candle;
  resolutionSec: number;
  basis: Basis;
  /** How long before the moment this price was set (0 when it is current). */
  staleSec: number;
}

/**
 * How old a price may be before the next, coarser resolution is tried: ten minutes for minute candles, three hours
 * for hourly, three days for daily. Always at least 10 minutes.
 */
export const toleranceSec = (resolutionSec: number) => Math.max(600, 3 * resolutionSec);

/**
 * The price at `instantSec` from `candles` of `resolutionSec` each (0 means point-in-time prices, such as hourly
 * snapshots). `latest` means "right now": use the newest candle's close even if it is still open.
 * Null when no candle starts at or before the moment.
 */
export function pickCandle(candles: Candle[], instantSec: number, resolutionSec: number, latest = false): Pick | null {
  const usable = candles.filter((c) => Number.isFinite(c.t) && Number.isFinite(c.close) && c.close > 0 && c.t <= instantSec).sort((a, b) => a.t - b.t);
  const newest = usable[usable.length - 1];
  if (!newest) return null;
  const end = (c: Candle) => c.t + resolutionSec;

  if (latest) return { priceUsd: newest.close, candle: newest, resolutionSec, basis: "latest", staleSec: Math.max(0, instantSec - end(newest)) };

  // The last candle that was finished by the moment.
  let finished: Candle | undefined;
  for (let i = usable.length - 1; i >= 0; i--) {
    if (end(usable[i]) <= instantSec) {
      finished = usable[i];
      break;
    }
  }
  // A candle the moment falls inside (only possible when candles have a length).
  const inside = resolutionSec > 0 && newest.t <= instantSec && instantSec < end(newest) ? newest : undefined;

  if (finished && (!inside || instantSec - end(finished) <= 0)) {
    return { priceUsd: finished.close, candle: finished, resolutionSec, basis: instantSec - end(finished) <= resolutionSec ? "close-before" : "carried-forward", staleSec: instantSec - end(finished) };
  }
  if (inside) {
    const adjacent = finished !== undefined && inside.t - end(finished) <= 0;
    // A moment exactly at a candle's start: nothing from that candle has traded yet, so the last finished one stands.
    const atStart = inside.t === instantSec;
    const openKnown = Number.isFinite(inside.open) && inside.open > 0;
    // Adjacent finished candle: its close is the same price this one opened at, so prefer it.
    if (finished && adjacent) return { priceUsd: finished.close, candle: finished, resolutionSec, basis: "close-before", staleSec: 0 };
    if (finished && (atStart || !openKnown)) {
      const stale = instantSec - end(finished);
      return { priceUsd: finished.close, candle: finished, resolutionSec, basis: stale <= resolutionSec ? "close-before" : "carried-forward", staleSec: stale };
    }
    if (openKnown) return { priceUsd: inside.open, candle: inside, resolutionSec, basis: "open-of-candle", staleSec: 0 };
    // No earlier price and no open: the candle's close is the only price there is, unless the moment is before it began.
    if (atStart) return null;
    return { priceUsd: inside.close, candle: inside, resolutionSec, basis: "open-of-candle", staleSec: 0 };
  }
  if (finished) return { priceUsd: finished.close, candle: finished, resolutionSec, basis: "carried-forward", staleSec: instantSec - end(finished) };
  return null;
}

export interface SeriesPoint {
  /** Seconds since the epoch (UTC): when this price was set. */
  t: number;
  usd: number;
}

/**
 * Candles as chart points. Each point sits at the END of its candle, where its close was set, so the point for the
 * last finished candle lands exactly on the moment that was asked about. At most `max` points: a longer series is
 * thinned evenly, keeping the first and the last.
 */
export function toSeries(candles: Candle[], resolutionSec: number, price: (c: Candle) => number, max = 160): SeriesPoint[] {
  const byTime = new Map<number, number>();
  for (const c of candles) {
    const usd = price(c);
    if (Number.isFinite(c.t) && Number.isFinite(usd) && usd > 0) byTime.set(c.t + resolutionSec, usd);
  }
  const all = [...byTime].map(([t, usd]) => ({ t, usd })).sort((a, b) => a.t - b.t);
  if (all.length <= max) return all;
  const step = (all.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => all[Math.round(i * step)]);
}

/** "45 seconds", "12 minutes", "3 hours 10 minutes", "2 days". */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(s / 3600);
  const mm = Math.round((s % 3600) / 60);
  if (s < 2 * 86400) return mm >= 1 && h < 24 ? `${h} hour${h === 1 ? "" : "s"} ${mm} minute${mm === 1 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** 0.00003219 -> "$0.00003219"; 1234.5 -> "$1,234.50"; 0.5 -> "$0.5000". Keeps enough digits for tiny prices. */
export function formatUsdPrice(x: number): string {
  if (!Number.isFinite(x)) return "n/a";
  if (x === 0) return "$0";
  if (x >= 1000) return `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (x >= 1) return `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (x >= 0.01) return `$${x.toFixed(4)}`;
  // Tiny: four significant digits after the leading zeros.
  const zeros = Math.floor(-Math.log10(x));
  return `$${x.toFixed(Math.min(zeros + 4, 12)).replace(/0+$/, "").replace(/\.$/, "")}`;
}
