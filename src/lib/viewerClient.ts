"use client";

import { useEffect, useState } from "react";

export interface Viewer {
  kind: "anonymous" | "user" | "trusted";
  email: string | null;
  dayLimit: number;
  canSignIn: boolean;
}

export const OPEN_SIGNIN_EVENT = "replay:open-signin";
export const OPEN_WAITLIST_EVENT = "replay:open-waitlist";

/** Opens the waitlist box from anywhere, e.g. a button on the landing page. */
export function openWaitlist() {
  window.dispatchEvent(new Event(OPEN_WAITLIST_EVENT));
}
export const AUTH_CHANGED_EVENT = "replay:auth-changed";

/** Opens the sign-in box from anywhere. `reason` is shown above the form, e.g. when the day's free checks have run out. */
export function openSignIn(reason?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_SIGNIN_EVENT, { detail: { reason } }));
}

async function fetchViewer(): Promise<Viewer | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    return res.ok ? ((await res.json()) as Viewer) : null;
  } catch {
    return null;
  }
}

/** Who this browser is, kept fresh when someone signs in or out. Null until the first answer. */
export function useViewer(): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () => void fetchViewer().then((v) => !stop && setViewer(v));
    load();
    window.addEventListener(AUTH_CHANGED_EVENT, load);
    return () => {
      stop = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, load);
    };
  }, []);
  return viewer;
}
