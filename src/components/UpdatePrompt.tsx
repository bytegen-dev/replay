"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

/** The build this page was loaded from. */
const MY_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
/** How often an open page checks for a newer build, besides when it comes back into view. */
const CHECK_MS = 5 * 60_000;

/**
 * Tells the person when the site has been updated since this page loaded, and offers one button to reload onto the new
 * version, so what is on screen never drifts out of step with the server. Asks once per new build; "Later" hides it until the next one.
 */
export function UpdatePrompt() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!MY_BUILD) return;
    let stop = false;
    async function check() {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { build?: string };
        if (!stop && body.build && body.build !== MY_BUILD) setLatest(body.build);
      } catch {
        /* offline or a blip: try again next time */
      }
    }
    const id = setInterval(check, CHECK_MS);
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, []);

  if (!latest || dismissed === latest) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 border border-primary bg-card px-4 py-3 shadow-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        <RefreshCw className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <b>Replay has been updated.</b> <span className="text-muted-foreground">Refresh to get the latest version.</span>
        </p>
        <button type="button" onClick={() => window.location.reload()} className="h-9 shrink-0 bg-primary px-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90">
          Refresh
        </button>
        <button type="button" onClick={() => setDismissed(latest)} aria-label="Not now" className="grid size-8 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
