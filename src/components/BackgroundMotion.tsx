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
    let fade = 0;
    let frame = 0;

    const target = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    // The hatch lines fade out as you scroll, and are gone before the "steps" section comes into view (0 at the top, 1 by then).
    // Pages without that section fade them over the first screenful.
    const fadeTarget = () => {
      const steps = document.getElementById("steps");
      const end = steps ? steps.getBoundingClientRect().top + window.scrollY - window.innerHeight : window.innerHeight * 0.8;
      return Math.min(1, Math.max(0, window.scrollY / Math.max(end, 200)));
    };
    const tick = () => {
      const goal = target();
      const fadeGoal = fadeTarget();
      current += (goal - current) * 0.045; // a long glide: roughly a second to catch up
      fade += (fadeGoal - fade) * 0.12;
      if (Math.abs(goal - current) < 0.0005) current = goal;
      if (Math.abs(fadeGoal - fade) < 0.002) fade = fadeGoal;
      root.style.setProperty("--p", current.toFixed(4));
      root.style.setProperty("--hatch-gone", fade.toFixed(3));
      frame = current === goal && fade === fadeGoal ? 0 : requestAnimationFrame(tick);
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
      root.style.removeProperty("--hatch-gone");
    };
  }, []);

  return null;
}
