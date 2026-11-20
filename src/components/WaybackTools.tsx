"use client";

import { Clock, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { DcaApp } from "@/components/DcaApp";
import { PricePanel } from "@/components/PricePanel";
import { cn } from "@/lib/utils";

type View = "buy" | "price";

const TABS: { view: View; label: string; blurb: string; Icon: typeof Clock }[] = [
  { view: "buy", label: "What if I had bought", blurb: "What a past buy, or a monthly habit, would be worth today.", Icon: TrendingUp },
  { view: "price", label: "Timestamp", blurb: "The price of anything at a past date and time.", Icon: Clock },
];

/** Which of the two a link is asking for: ?view=price, or any of the keys only the price form writes (asset, date, time, tz). */
function viewFromUrl(): View {
  const q = new URLSearchParams(window.location.search);
  if (q.get("view") === "price") return "price";
  if (q.get("view") !== "buy" && ["asset", "date", "time", "tz"].some((k) => q.has(k))) return "price";
  return "buy";
}

/**
 * Wayback is one tool with two jobs: what a buy from the past would be worth today (it opens here), and the price of something on a
 * past day. Each is its own form, which reads and writes its own settings in the address bar, so switching starts the other from a clean
 * address (?view=price for the price one) and the form for the other view loads fresh.
 */
export function WaybackTools() {
  // The server draws the first view, so it starts on "buy"; a link that asks for the price view switches over right after load.
  const [view, setView] = useState<View>("buy");
  useEffect(() => {
    const id = setTimeout(() => setView(viewFromUrl()), 0);
    return () => clearTimeout(id);
  }, []);

  function choose(next: View) {
    if (next === view) return;
    window.history.replaceState(null, "", next === "price" ? "/wayback?view=price" : "/wayback");
    setView(next);
  }

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="What to do" className="mb-5 grid max-w-3xl gap-3 sm:grid-cols-2">
        {TABS.map((t) => {
          const on = view === t.view;
          return (
            <button
              key={t.view}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => choose(t.view)}
              // The same cut-corner outline as the cards on the site: mint and softly filled when chosen, plain until pointed at.
              style={{ "--edge": on ? "var(--primary)" : undefined, "--fill": on ? "color-mix(in srgb, var(--primary) 10%, var(--card))" : undefined } as React.CSSProperties}
              className={cn("cut-card group relative flex cursor-pointer items-start gap-3 border border-border p-4 text-left transition-[filter] duration-200 hover:[--edge:color-mix(in_srgb,var(--primary)_55%,var(--border))]", on && "hover:[--edge:var(--primary)]")}
            >
              {/* The dotted texture of the chosen card, clipped to the card's own cut corners. */}
              {on && <span aria-hidden className="tex-layer" />}
              <span className={cn("relative z-10 flex size-9 shrink-0 items-center justify-center border bg-card/30 backdrop-blur-md transition-colors", on ? "border-primary text-primary" : "border-border text-muted-foreground group-hover:border-primary/60 group-hover:text-foreground")}>
                <t.Icon className="size-4.5" strokeWidth={1.8} aria-hidden />
              </span>
              <span className="relative z-10 flex min-w-0 flex-col gap-0.5">
                <span className={cn("font-heading text-base font-bold", on ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{t.label}</span>
                <span className="text-xs leading-snug text-muted-foreground">{t.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
      {view === "buy" ? <DcaApp /> : <PricePanel />}
    </div>
  );
}
