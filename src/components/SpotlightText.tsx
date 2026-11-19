"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A paragraph whose text lifts to full contrast in a soft circle around the pointer: the muted grey brightens on a dark
 * theme and darkens on a light one. It is a second, identical copy of the text on top, revealed through a mask that
 * follows the pointer, so the layout never moves. The copy is hidden from screen readers.
 */
export function SpotlightText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [on, setOn] = useState(false);

  function move(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  }

  const mask = "radial-gradient(circle 110px at var(--sx, 50%) var(--sy, 50%), #000 0%, rgba(0,0,0,0.55) 45%, transparent 100%)";
  return (
    <p ref={ref} className={cn("relative", className)} onPointerEnter={() => setOn(true)} onPointerLeave={() => setOn(false)} onPointerMove={move}>
      {text}
      <span aria-hidden className="pointer-events-none absolute inset-0 text-foreground transition-opacity duration-300" style={{ opacity: on ? 1 : 0, maskImage: mask, WebkitMaskImage: mask }}>
        {text}
      </span>
    </p>
  );
}
