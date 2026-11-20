/**
 * The viewer's display settings: theme, reduced motion and high contrast. They live in localStorage and are applied as
 * attributes on <html> (data-theme, data-motion, data-contrast), which the stylesheet keys off. Pure logic here, so it is
 * easy to test; the browser-only parts are in SettingsProvider.
 */

export type ThemePref = "light" | "system" | "dark";

export interface Settings {
  theme: ThemePref;
  /** Turn off animations and transitions, whatever the system says. */
  reduceMotion: boolean;
  /** Stronger text, borders and focus rings, and no decorative backdrop. */
  highContrast: boolean;
}

export const DEFAULT_SETTINGS: Settings = { theme: "system", reduceMotion: false, highContrast: false };
export const STORAGE_KEY = "replay-settings";

/** Reads stored settings, ignoring anything that is not a known value. */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const p = JSON.parse(raw) as Partial<Settings> | null;
    return {
      theme: p?.theme === "light" || p?.theme === "dark" || p?.theme === "system" ? p.theme : DEFAULT_SETTINGS.theme,
      reduceMotion: p?.reduceMotion === true,
      highContrast: p?.highContrast === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** "system" follows the device; the other two are taken as they are. */
export function resolveTheme(pref: ThemePref, systemPrefersLight: boolean): "light" | "dark" {
  return pref === "light" || (pref === "system" && systemPrefersLight) ? "light" : "dark";
}

/** Sets the attributes the stylesheet reads. */
export function applySettings(s: Settings, systemPrefersLight: boolean, root: HTMLElement): void {
  root.dataset.theme = resolveTheme(s.theme, systemPrefersLight);
  setTabIcon(root.dataset.theme === "light");
  if (s.reduceMotion) root.dataset.motion = "reduce";
  else delete root.dataset.motion;
  if (s.highContrast) root.dataset.contrast = "high";
  else delete root.dataset.contrast;
}

/**
 * The tab's icon follows the site's theme: the mark drawn for a light page when the theme is light, the other one otherwise. Browsers
 * often ignore a changed href on an icon link that is already there, so the link is replaced with a new one.
 */
export const TAB_ICON = { dark: "/replay-logo.png", light: "/replay-logo-light.png" } as const;
export function setTabIcon(light: boolean): void {
  if (typeof document === "undefined") return;
  const href = light ? TAB_ICON.light : TAB_ICON.dark;
  const old = document.head.querySelectorAll('link[rel="icon"]');
  if (old.length === 1 && (old[0] as HTMLLinkElement).getAttribute("href") === href) return;
  old.forEach((l) => l.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Runs in <head> before the page paints, so the right theme is there from the first frame (no flash of dark on a light
 * device). It does the same thing as applySettings, written out as plain JavaScript.
 */
export const HEAD_SCRIPT = `(function(){var r=document.documentElement;try{var s=JSON.parse(localStorage.getItem("${STORAGE_KEY}")||"{}");var t=s.theme==="light"||s.theme==="dark"?s.theme:"system";var l=t==="light"||(t==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches);r.dataset.theme=l?"light":"dark";var h=l?"/replay-logo-light.png":"/replay-logo.png";document.querySelectorAll('link[rel="icon"]').forEach(function(e){e.remove()});var k=document.createElement("link");k.rel="icon";k.type="image/png";k.href=h;document.head.appendChild(k);if(s.reduceMotion===true)r.dataset.motion="reduce";if(s.highContrast===true)r.dataset.contrast="high"}catch(e){r.dataset.theme="dark"}})();`;

/** True when animation should be skipped: the viewer's own toggle, or the system setting. */
export function motionReduced(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
