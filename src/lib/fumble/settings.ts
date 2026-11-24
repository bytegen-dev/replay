import { isCurrency } from "../fxCurrencies.ts";

/**
 * The Fumble page's settings, kept in this browser (localStorage) as one small JSON object.
 *
 *  - currency: the primary currency, the one figures lead with. "SOL" (the default), or the code of any currency the site knows (USD included).
 *  - second: the secondary currency, the small line under each figure: "NONE" for no line, "SOL", or any currency (dollars by default). When it is
 *    the same as the primary there is nothing to add, so the page shows SOL under a primary of dollars and dollars under anything else.
 *  - sellsOnly: list only the sells in the table, which are the trades that have a profit and a fumble.
 *  - perLoad: how many trades a scan reads at a time, and each "load more".
 *  - hidePnl, hideRoundtrip, hideFumble, hideVolume: what to do with each of those numbers, on the page and on the pictures: "show" it (the default),
 *    "mask" it (drawn as ***, so it is clear something is there) or "hide" it (left out, and the rest closes up). The PnL also covers the best trade on the
 *    picture; the fumble covers the fumble figure and the Fumbled column.
 *  - hideWallet: the wallet address is shown, or dotted out in the box and drawn as *** on the picture. There is nothing to leave out, so no "hide".
 */
export const SETTINGS_KEY = "replay-fumble-settings";

export const PER_LOAD_CHOICES = [50, 100, 250, 500] as const;

/** What to do with a number: show it, draw it as ***, or leave it out. */
export type HideMode = "show" | "mask" | "hide";
export const HIDE_MODES: readonly HideMode[] = ["show", "mask", "hide"];

export interface FumbleSettings {
  currency: string;
  second: string;
  sellsOnly: boolean;
  perLoad: (typeof PER_LOAD_CHOICES)[number];
  hidePnl: HideMode;
  hideRoundtrip: HideMode;
  hideFumble: HideMode;
  hideVolume: HideMode;
  hideWallet: boolean;
}

export const DEFAULT_SETTINGS: FumbleSettings = { currency: "SOL", second: "USD", sellsOnly: false, perLoad: 100, hidePnl: "show", hideRoundtrip: "show", hideFumble: "show", hideVolume: "show", hideWallet: false };

/**
 * The two currencies always make a pair of SOL and one other currency, or have no secondary: two currencies would crowd the figure, and SOL twice
 * says nothing. So SOL for both becomes SOL and dollars, and two currencies become the first and SOL.
 */
export function normalizePair(currency: string, second: string): { currency: string; second: string } {
  if (second === "NONE") return { currency, second };
  if (currency === "SOL" && second === "SOL") return { currency, second: "USD" };
  if (currency !== "SOL" && second !== "SOL") return { currency, second: "SOL" };
  return { currency, second };
}

/** What choosing `code` in the primary or the secondary selector does to the settings, with the other one adjusting to keep the pair valid. */
export function applyChoice(settings: FumbleSettings, which: "primary" | "secondary", code: string): Partial<FumbleSettings> {
  if (which === "primary") {
    // A currency as the primary makes SOL the secondary; SOL as the primary keeps a currency (or none) as the secondary.
    return normalizePair(code, code === "SOL" ? settings.second : "SOL");
  }
  if (code === "NONE") return { second: "NONE" };
  // A currency as the secondary makes SOL the primary; SOL as the secondary needs a currency as the primary.
  return code === "SOL" ? normalizePair(settings.currency === "SOL" ? "USD" : settings.currency, "SOL") : { currency: "SOL", second: code };
}

/** A stored mode, checked. Anything unknown is "show"; a plain true (how this was first saved, when it was only on or off) means "mask". */
function hideMode(v: unknown): HideMode {
  if (v === true) return "mask";
  return HIDE_MODES.find((m) => m === v) ?? "show";
}

/** What was stored, checked: anything that is not valid falls back to its default, and unreadable data gives the defaults. */
export function parseSettings(raw: string | null): FumbleSettings {
  try {
    const j = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
    const c = typeof j?.currency === "string" ? j.currency.trim().toUpperCase() : "";
    const per = PER_LOAD_CHOICES.find((n) => n === j?.perLoad);
    const sec = typeof j?.second === "string" ? j.second.trim().toUpperCase() : "";
    const pair = normalizePair(c === "SOL" || isCurrency(c) ? c : DEFAULT_SETTINGS.currency, sec === "NONE" || sec === "SOL" || isCurrency(sec) ? sec : DEFAULT_SETTINGS.second);
    return {
      ...pair,
      sellsOnly: typeof j?.sellsOnly === "boolean" ? j.sellsOnly : DEFAULT_SETTINGS.sellsOnly,
      perLoad: per ?? DEFAULT_SETTINGS.perLoad,
      hidePnl: hideMode(j?.hidePnl),
      hideRoundtrip: hideMode(j?.hideRoundtrip),
      hideFumble: hideMode(j?.hideFumble),
      hideVolume: hideMode(j?.hideVolume),
      hideWallet: typeof j?.hideWallet === "boolean" ? j.hideWallet : DEFAULT_SETTINGS.hideWallet,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function readSettings(): FumbleSettings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Saves the settings; a browser that refuses storage just does not remember them. */
export function writeSettings(s: FumbleSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* not remembered */
  }
}
