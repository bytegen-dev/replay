"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORE = "replay-chart-dots";

/** Whether charts draw a dot on each data point. On by default, and remembered in this browser for every chart. */
export function useDotsPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (localStorage.getItem(STORE) === "off") setOn(false);
      } catch {
        /* no storage: the default stays */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  return [
    on,
    (v) => {
      setOn(v);
      try {
        localStorage.setItem(STORE, v ? "on" : "off");
      } catch {
        /* not saved, but it still applies now */
      }
    },
  ];
}

/** A small pill that shows or hides the dots on a chart's line. */
export function DotsToggle({ on, onChange, className }: { on: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      title={on ? "Hide the dots on the line" : "Show a dot for each month"}
      className={cn("h-7 min-w-9 px-2 text-xs font-bold", on ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground", className)}
    >
      Dots
    </button>
  );
}
