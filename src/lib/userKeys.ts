import { isTiingoKey } from "./tiingo.ts";

/** The user's own stock-price key, kept only in this browser (never in the shared settings, never in a link). */
const STORE = "replay-keys";

export function getTiingoKey(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}")?.tiingo;
    return isTiingoKey(v) ? v : null;
  } catch {
    return null;
  }
}

/** Saves the key, or removes it when given null. Returns false when the browser won't store it. */
export function setTiingoKey(key: string | null): boolean {
  try {
    if (key === null) localStorage.removeItem(STORE);
    else localStorage.setItem(STORE, JSON.stringify({ tiingo: key }));
    return true;
  } catch {
    return false;
  }
}
