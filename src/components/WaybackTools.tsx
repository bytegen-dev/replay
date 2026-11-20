"use client";

import { useEffect, useState } from "react";
import { DcaApp } from "@/components/DcaApp";
import { PricePanel } from "@/components/PricePanel";
import { cn } from "@/lib/utils";

type View = "buy" | "price";

const TABS: { view: View; label: string }[] = [
  { view: "buy", label: "What if I had bought" },
  { view: "price", label: "Price on a day" },
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
      <div role="tablist" aria-label="What to do" className="mb-4 flex w-fit max-w-full">
        {TABS.map((t, i) => (
          <button
            key={t.view}
            type="button"
            role="tab"
            aria-selected={view === t.view}
            data-state={view === t.view ? "on" : "off"}
            onClick={() => choose(t.view)}
            className={cn(
              "form-control-h cursor-pointer border border-border px-4 text-sm transition-colors",
              i === 0 ? "cut-tab-first" : "cut-tab-last -ml-px",
              view === t.view ? "border-primary bg-primary font-bold text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {view === "buy" ? <DcaApp /> : <PricePanel />}
    </div>
  );
}
