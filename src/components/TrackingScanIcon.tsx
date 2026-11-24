"use client";

import { useEffect, useRef } from "react";
import { trackOffset } from "@/lib/cursorTrack.ts";

/** How close the pointer has to be (in pixels) before the lens notices it, and the furthest the lens leans (in the icon's own 24-unit grid). */
const REACH = 520;
const MAX_LEAN = 3;
/**
 * How the lens moves, per 60th of a second: it covers a small share of the way to where it is headed (so it eases in and settles, with no bounce), and can never
 * move more than SPEED grid units in one step (so a pointer that darts across does not snap it over, it has to be pulled). It follows with FOLLOW and lets go
 * more slowly, with RELEASE, so it clings a moment after the pointer leaves: that is what makes it a little sticky.
 */
const FOLLOW = 0.055;
const RELEASE = 0.03;
const SPEED = 0.11;

/**
 * The scan-and-search icon (the same drawing as the menu's Recap icon: four corner brackets and a lens), with a lens that follows the pointer: when the pointer
 * is near, it leans toward it, slowly and a little stickily (see the constants), and eases back to the middle when the pointer goes away. The brackets stay still. Nothing happens on a touch
 * screen, or when the visitor has asked for less motion (the system setting, or the site's own). It moves the lens by setting an attribute on every frame, not
 * by re-rendering, so following the pointer costs the page nothing.
 */
export function TrackingScanIcon({ className, strokeWidth = 1.5 }: { className?: string; strokeWidth?: number }) {
  const svg = useRef<SVGSVGElement>(null);
  const lens = useRef<SVGGElement>(null);

  useEffect(() => {
    const svgEl = svg.current;
    const lensEl = lens.current;
    if (!svgEl || !lensEl) return;
    let target = { x: 0, y: 0 };
    let at = { x: 0, y: 0 };
    let frame = 0;

    const calm = () => document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The share and the speed limit are for a 60th of a second, scaled by the time that really passed, so it feels the same on a 120 Hz screen.
    let last = 0;
    const step = (now: number) => {
      const dt = last ? Math.min(3, (now - last) / (1000 / 60)) : 1;
      last = now;
      const going = target.x === 0 && target.y === 0;
      const share = 1 - Math.pow(1 - (going ? RELEASE : FOLLOW), dt);
      let mx = (target.x - at.x) * share;
      let my = (target.y - at.y) * share;
      const len = Math.hypot(mx, my);
      const cap = SPEED * dt;
      if (len > cap) {
        mx *= cap / len;
        my *= cap / len;
      }
      at = { x: at.x + mx, y: at.y + my };
      lensEl.setAttribute("transform", `translate(${at.x.toFixed(3)} ${at.y.toFixed(3)})`);
      if (Math.abs(target.x - at.x) > 0.002 || Math.abs(target.y - at.y) > 0.002) frame = requestAnimationFrame(step);
      else {
        frame = 0;
        last = 0;
      }
    };
    const aim = (x: number, y: number) => {
      target = { x, y };
      if (!frame) frame = requestAnimationFrame(step);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || calm()) return aim(0, 0);
      const r = svgEl.getBoundingClientRect();
      const o = trackOffset({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, { x: e.clientX, y: e.clientY }, REACH, MAX_LEAN);
      aim(o.x, o.y);
    };
    const onAway = () => aim(0, 0);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onAway);
    window.addEventListener("blur", onAway);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onAway);
      window.removeEventListener("blur", onAway);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <svg ref={svg} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <g ref={lens}>
        <circle cx="12" cy="12" r="3" />
        <path d="m16 16-1.9-1.9" />
      </g>
    </svg>
  );
}
