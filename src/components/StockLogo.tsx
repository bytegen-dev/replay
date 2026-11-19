"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A company's logo, circular. Loaded from Financial Modeling Prep's public logo images by ticker (only the ticker is sent);
 * when there is none, or it can't load, a circle with the ticker's first letter stands in.
 */
export function StockLogo({ symbol, className = "size-5" }: { symbol: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[0.6rem] font-bold text-muted-foreground", className)}>
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-white object-cover", className)}
    />
  );
}
