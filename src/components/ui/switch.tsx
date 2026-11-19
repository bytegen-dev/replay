"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

/**
 * An on/off switch. The thumb slides with a small overshoot and stretches while it is pressed, the track fades between its
 * two colours, and a tick fades in on the thumb when it is on.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // 28px x 48px with a 1px border leaves 26 x 46 inside; 3px of padding all round leaves exactly 20px for the 20px thumb,
        // so it sits the same distance from the top, bottom and the end it is resting at. Pixels, not rem: the page's base font
        // is 14px, so rem sizes would shrink the track and thumb by different amounts and spoil the even gaps.
        "group relative inline-flex h-[28px] w-[48px] shrink-0 items-center border border-border bg-secondary p-[3px] outline-none transition-colors duration-300",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary/25",
        "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none grid h-[20px] w-[20px] place-items-center bg-muted-foreground text-primary-foreground",
          "transition-[transform,width,background-color] duration-300 ease-[cubic-bezier(0.34,1.45,0.5,1)]",
          "group-active:w-[24px] data-[state=checked]:translate-x-[20px] data-[state=checked]:bg-primary data-[state=checked]:group-active:translate-x-[16px]",
        )}
      >
        <svg viewBox="0 0 12 12" className="size-3 opacity-0 transition-opacity duration-200 group-data-[state=checked]:opacity-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2.5 6.3 5 8.8l4.5-5" />
        </svg>
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
