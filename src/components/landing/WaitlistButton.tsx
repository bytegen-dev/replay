"use client";

import { Button } from "@/components/ui/button";
import { openWaitlist } from "@/lib/viewerClient.ts";
import { cn } from "@/lib/utils";

/** A button anywhere on the landing page that opens the same waitlist box as the header. */
export function WaitlistButton({ className, children = "Join the waitlist" }: { className?: string; children?: React.ReactNode }) {
  return (
    <Button type="button" onClick={() => openWaitlist()} className={cn("cut-btn cut-btn-solid h-12 rounded-none px-7 text-base font-bold", className)}>
      {children}
    </Button>
  );
}
