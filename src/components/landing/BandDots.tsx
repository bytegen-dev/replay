"use client";

import { useEffect, useRef } from "react";
import { motionReduced } from "@/lib/settings.ts";

/**
 * The dot grid behind the landing page's demo, with its light. By default a soft band of light sweeps across the dots (all CSS).
 * While a mouse is over the section the sweep gives way to a pool of light that glides to the cursor and follows it, starting from
 * wherever the sweep had got to, so it reads as the same light turning toward you. When the pointer leaves, the sweep takes over again.
 * Touch screens and reduced motion keep the plain behaviour.
 */
export function BandDots({ className }: { className?: string }) {
  const dots = useRef<HTMLDivElement>(null);
  const lit = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = dots.current?.parentElement;
    const litEl = lit.current;
    const spotEl = spot.current;
    if (!section || !litEl || !spotEl || motionReduced()) return;

    let hovering = false;
    let frame = 0;
    let cx = 0;
    let cy = 0;
    let tx = 0;
    let ty = 0;

    const place = () => {
      spotEl.style.setProperty("--sx", `${cx.toFixed(1)}px`);
      spotEl.style.setProperty("--sy", `${cy.toFixed(1)}px`);
    };
    const tick = () => {
      cx += (tx - cx) * 0.085;
      cy += (ty - cy) * 0.085;
      place();
      frame = hovering ? requestAnimationFrame(tick) : 0;
    };
    const local = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };
    /** Where the sweep's centre is across the section right now, read from its animated mask position (the mask is 320% wide). */
    const sweepX = (w: number) => {
      const cs = getComputedStyle(litEl);
      const pos = cs.maskPosition || cs.getPropertyValue("-webkit-mask-position");
      const pct = parseFloat(pos.split(/[ ,]/)[0]);
      return Number.isFinite(pct) ? w * (1.6 - (2.2 * pct) / 100) : w / 2;
    };

    const enter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const p = local(e);
      tx = p.x;
      ty = p.y;
      if (!hovering) {
        // Begin where the sweep is (kept on screen), at the pointer's height, and slide from there.
        cx = Math.min(p.w, Math.max(0, sweepX(p.w)));
        cy = p.y;
        place();
        hovering = true;
        litEl.style.opacity = "0";
        spotEl.style.opacity = "1";
        if (!frame) frame = requestAnimationFrame(tick);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (!hovering) {
        enter(e);
        return;
      }
      const p = local(e);
      tx = p.x;
      ty = p.y;
    };
    const leave = () => {
      hovering = false;
      litEl.style.removeProperty("opacity");
      spotEl.style.opacity = "0";
    };

    section.addEventListener("pointerenter", enter);
    section.addEventListener("pointermove", move);
    section.addEventListener("pointerleave", leave);
    return () => {
      section.removeEventListener("pointerenter", enter);
      section.removeEventListener("pointermove", move);
      section.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div ref={dots} aria-hidden className={`band-dots ${className ?? ""}`} />
      <div ref={lit} aria-hidden className={`band-dots-lit ${className ?? ""}`} />
      <div ref={spot} aria-hidden className={`band-dots-spot ${className ?? ""}`} />
    </>
  );
}
