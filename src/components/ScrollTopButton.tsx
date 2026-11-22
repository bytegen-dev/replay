"use client";

import { motionReduced } from "@/lib/settings.ts";

/** Takes you back to the top of the page: eased, or straight there for people who prefer reduced motion. */
export function ScrollTopButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.scrollTo({ top: 0, behavior: motionReduced() ? "auto" : "smooth" })}
    >
      Back to top
    </button>
  );
}
