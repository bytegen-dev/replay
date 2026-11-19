"use client";

import { useEffect } from "react";
import { motionReduced } from "@/lib/settings.ts";

/**
 * Feeds the page backdrop. It publishes how far down the page you are as --p (0 to 1) on <html>, and it eases toward the
 * real scroll position instead of jumping to it, so the glows and hatch lines drift slowly behind your scrolling and keep
 * gliding for a moment after you stop. Nothing renders. Reduced-motion users get a still backdrop.
 */
export function BackgroundMotion() {
  useEffect(() => {
    if (motionReduced()) return;
    const root = document.documentElement;
    let current = 0;
    let frame = 0;

    const target = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    const tick = () => {
      const goal = target();
      current += (goal - current) * 0.045; // a long glide: roughly a second to catch up
      if (Math.abs(goal - current) < 0.0005) current = goal;
      root.style.setProperty("--p", current.toFixed(4));
      frame = current === goal ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    wake();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      cancelAnimationFrame(frame);
      root.style.removeProperty("--p");
    };
  }, []);

  return null;
}
