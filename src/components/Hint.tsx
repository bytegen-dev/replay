"use client";

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A few words with a tooltip: it opens on hover or focus, and a tap or click toggles it, so it works by touch too (the browser's own `title`
 * tooltip is slow to appear and never shows on a phone). The dotted underline says there is more to see.
 */
export function Hint({ text, children, className }: { text: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault(); // stops the tooltip's own click-to-close, so a tap toggles it
              setOpen((o) => !o);
            }}
            className={cn("cursor-help underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", className)}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
