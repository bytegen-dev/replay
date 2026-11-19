"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Tickers whose logo has already loaded (or is known to be missing), so reopening a list doesn't flash the letter again. */
const loaded = new Set<string>();
const missing = new Set<string>();

/**
 * A company's logo, circular. The ticker's first letter sits in the circle straight away and the logo fades in over it once it
 * has arrived (it comes through our own cached route, so it is only slow the first time). With no logo, the letter stays.
 */
export function StockLogo({ symbol, className = "size-5" }: { symbol: string; className?: string }) {
  const [ready, setReady] = useState(loaded.has(symbol));
  const [failed, setFailed] = useState(missing.has(symbol));
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[0.6rem] font-bold text-muted-foreground", className)}>
      {symbol.slice(0, 1)}
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/stock-logo?s=${encodeURIComponent(symbol)}`}
          alt=""
          decoding="async"
          onLoad={() => {
            loaded.add(symbol);
            setReady(true);
          }}
          onError={() => {
            missing.add(symbol);
            setFailed(true);
          }}
          className={cn("absolute inset-0 size-full rounded-full bg-white object-cover transition-opacity duration-200", ready ? "opacity-100" : "opacity-0")}
        />
      )}
    </span>
  );
}
