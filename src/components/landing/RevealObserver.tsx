"use client";

import { useLayoutEffect } from "react";
import { motionReduced } from "@/lib/settings.ts";

/**
 * Makes the landing page's sections arrive as they are scrolled to. Anything marked data-reveal-on-scroll that is below the
 * fold is hidden before the first paint (so there is no flash) and eased in when it comes into view; anything already on screen
 * is left alone. It sets plain attributes on the elements, which the stylesheet turns into the animation, and does nothing at all
 * for people who prefer reduced motion.
 */
export function RevealObserver() {
  useLayoutEffect(() => {
    if (motionReduced()) return;
    const root = document.documentElement;
    const items = [...document.querySelectorAll<HTMLElement>("[data-reveal-on-scroll]")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.dataset.reveal = "shown";
          io.unobserve(e.target);
          // While "shown" the entrance's own transition list applies, and it would cancel an element's hover transitions (a card's
          // shadow, a row's slide). Once the entrance has played, the attribute is dropped and the element's own styles take over.
          // Dropping it changes nothing visible: the shown state is just the element's normal look.
          const delay = Number(el.style.getPropertyValue("--d")) || 0;
          setTimeout(() => delete el.dataset.reveal, delay + 1300);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    root.classList.add("reveal-armed");
    for (const el of items) {
      // Already in view when the page opens: no animation, the hero has its own.
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) continue;
      el.dataset.reveal = "hidden";
      io.observe(el);
    }
    return () => {
      io.disconnect();
      root.classList.remove("reveal-armed");
      for (const el of items) delete el.dataset.reveal;
    };
  }, []);

  return null;
}
