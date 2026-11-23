import { signedSol, signedUsd, sol, usd } from "./view.ts";

/**
 * Which currencies a figure is shown in: a primary one, which is the big figure, and an optional secondary one, which is the small line under it.
 * Each is SOL, dollars, or any other currency. A dollar value is turned into another currency at today's rate (`perUsd`: units of the currency per
 * 1 US dollar), so a converted value is an approximation of what the amount is worth now, and the small line marks it with "≈".
 */
export type Unit = { code: "SOL" } | { code: string; symbol: string; perUsd: number };

export const SOL_UNIT: Unit = { code: "SOL" };
export const USD_UNIT: Unit = { code: "USD", symbol: "$", perUsd: 1 };

/** What the page shows: the big figure's currency, and the small line's (none for no small line). */
export type Display = Unit & { second?: Unit | null };

/** A display with both currencies set. */
export const showIn = (primary: Unit, second: Unit | null = null): Display => ({ ...primary, second });

export const SOL_DISPLAY: Display = showIn(SOL_UNIT, USD_UNIT);
export const USD_DISPLAY: Display = showIn(USD_UNIT, SOL_UNIT);

/** An amount in a currency with a symbol: whole units from 100 up, cents below; a sign when asked, and a minus always. */
export function localMoney(n: number, symbol: string, signed = false): string {
  const body = `${symbol}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 })}`;
  return n < 0 ? `-${body}` : signed && n > 0 ? `+${body}` : body;
}

export interface Figure {
  /** The first line: big. */
  main: string;
  /** The line under it, or null when there is nothing to put there. */
  sub: string | null;
}

const isFiat = (u: Unit): u is Extract<Unit, { perUsd: number }> => "perUsd" in u;

/** One amount in one currency, or null when it cannot be worked out (a currency amount needs a dollar value to convert). */
function render(u: Unit, solAmount: number, usdAmount: number | null, signed: boolean): string | null {
  if (!isFiat(u)) return signed ? signedSol(solAmount) : sol(solAmount);
  if (usdAmount === null) return null;
  if (u.code === "USD") return signed ? signedUsd(usdAmount) : usd(usdAmount);
  return localMoney(usdAmount * u.perUsd, u.symbol, signed);
}

/**
 * One figure for one display. `solAmount` is always known; `usdAmount` is null when no dollar price was found (then the big figure is in SOL
 * whatever was picked, and a small line in another currency is left out). `signed` puts a plus on a gain in the big figure, for a profit. The small
 * line never has a sign: the big figure already says gain or loss.
 */
export function figure(d: Display, solAmount: number, usdAmount: number | null, signed = false): Figure {
  let shown: Unit = d;
  let main = render(d, solAmount, usdAmount, signed);
  if (main === null) {
    shown = SOL_UNIT;
    main = render(SOL_UNIT, solAmount, usdAmount, signed)!;
  }
  const second = d.second;
  if (!second || second.code === shown.code) return { main, sub: null };
  const t = render(second, Math.abs(solAmount), usdAmount === null ? null : Math.abs(usdAmount), false);
  return { main, sub: t === null ? null : isFiat(second) ? `≈${t}` : t };
}
