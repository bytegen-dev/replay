"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applySettings, DEFAULT_SETTINGS, parseSettings, STORAGE_KEY, type Settings } from "@/lib/settings.ts";

interface Ctx {
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, set: () => {}, reset: () => {} });
export const useSettings = () => useContext(SettingsContext);

/**
 * Holds the viewer's display settings, saves them in this browser and keeps <html>'s attributes in step. The head script has
 * already set those attributes before the first paint; this makes them editable and follows the device's light/dark setting
 * while "System" is chosen.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Read what was saved once the page is up (localStorage does not exist while the server renders).
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        setSettings(parseSettings(localStorage.getItem(STORAGE_KEY)));
      } catch {
        /* storage blocked: keep the defaults */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // Keep the page's attributes right, including when the device switches between light and dark while "System" is chosen.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => applySettings(settings, mq.matches, document.documentElement);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings]);

  const set = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: the change still applies for this visit */
      }
      return next;
    });
  }, []);
  const reset = useCallback(() => set(DEFAULT_SETTINGS), [set]);

  const value = useMemo(() => ({ settings, set, reset }), [settings, set, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
