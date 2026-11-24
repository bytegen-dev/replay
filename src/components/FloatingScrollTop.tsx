"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { motionReduced } from "@/lib/settings.ts";
import { cn } from "@/lib/utils";

/** How far down the page has to be before the button shows: about a screen and a half is never "near the top". */
const SHOW_AFTER = 700;

/** A round-cornered arrow in the bottom right that takes you back to the top once you have scrolled a way down. Eased, or straight there with reduced motion. */
export function FloatingScrollTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // The button sits in a fixed wrapper: the cut-corner style sets its own position, so the wrapper is what floats.
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "fixed right-4 bottom-[max(1.75rem,calc(env(safe-area-inset-bottom)+0.75rem))] z-[60] transition-[opacity,translate] duration-300 sm:right-6",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <button
        type="button"
        aria-label="Back to top"
        title="Back to top"
        tabIndex={show ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: motionReduced() ? "auto" : "smooth" })}
        className="cut-btn flex size-11 items-center justify-center text-primary"
      >
        <ArrowUp className="size-5" aria-hidden />
      </button>
    </div>
  );
}
