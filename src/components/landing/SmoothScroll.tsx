"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";
import { motionReduced } from "@/lib/settings.ts";

/**
 * Smooth, eased scrolling for the landing page, with Lenis. It only changes how the wheel moves the page: the browser's own
 * scroll position is still the truth, so the sticky header, the moving backdrop and anchor links keep working. It does nothing
 * for people who prefer reduced motion, pauses while a dialog is open, and shuts down when the page is left.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (motionReduced()) return;
    const lenis = new Lenis({
      duration: 1.15,
      // Fast at the start, settling softly: the classic ease-out.
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // The links like "Try it first" glide to their section, stopping below the sticky header.
      anchors: { offset: -88 },
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    // An open dialog locks the page behind it (Radix marks the body); smooth scrolling must not move the page then.
    const sync = () => (document.body.hasAttribute("data-scroll-locked") ? lenis.stop() : lenis.start());
    const watch = new MutationObserver(sync);
    watch.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked", "style"] });
    sync();

    return () => {
      watch.disconnect();
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
