"use client";

import { useEffect, useRef } from "react";
import { motionReduced } from "@/lib/settings.ts";
import { cn } from "@/lib/utils";

/** How fast the light moves, along the line and round the card alike, in pixels a second. One speed, so it reads as one journey. */
const SPEED = 820;
/** How much faster it goes once the pointer has left, so it gets to the exit without a long wait. */
const FINISH = 2;
/** The comet's length: on the line, and its tail on the card's edge. */
const TAIL = 190;
/** The slanted corners of the card (top right, bottom left), in pixels: the same as the card's own cut. */
const CUT = 18;
/** The tail fades because it is drawn as this many strokes of different lengths, all ending at the head, stacked. */
const LAYERS = 14;

type Phase = "idle" | "enter" | "orbit" | "drain" | "exit";

/**
 * A card with a line running straight through it, from one side of the screen to the other, in the card's border colour and kept
 * behind the card. Hovering the card sends a pulse of light along the line from the left edge of the screen. At the card it turns
 * onto the border and circles it clockwise, at an even speed all the way round (the path is the card's real outline, slanted
 * corners included), for as long as the pointer stays. When the pointer leaves, the light carries on to the middle of the right-hand
 * side, its tail draws in behind it, and it leaves along the line to the right edge of the screen.
 *
 * With reduced motion the line is simply there.
 */
export function LineCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { "data-reveal-on-scroll"?: boolean }) {
  const line = useRef<HTMLDivElement>(null);
  const comet = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const layers = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    const lineEl = line.current;
    const cometEl = comet.current;
    const cardEl = card.current;
    const svgEl = svg.current;
    const paths = layers.current.filter((p): p is SVGPathElement => !!p);
    if (!lineEl || !cometEl || !cardEl || !svgEl || paths.length === 0 || motionReduced()) return;

    // The card's outline as a path that starts in the middle of the left edge and runs clockwise, and how long it is.
    let perimeter = 1;
    let toRight = 1; // the distance along it from the start to the middle of the right edge: the way out
    const measure = () => {
      // Unrounded sizes (offsetHeight rounds, which would put the bottom edge up to half a pixel off).
      const w = cardEl.getBoundingClientRect().width;
      const h = cardEl.getBoundingClientRect().height;
      // The svg's corner is the card's border-box corner, and the card's 1px edge is drawn inside that box, so its centre is half a
      // pixel in from each side. (The diagonals are nudged by the same half pixel, measured across the cut.)
      const o = 0.5;
      const d = `M${o} ${h / 2} L${o} ${o} L${w - CUT - 0.2} ${o} L${w - o} ${CUT + 0.2} L${w - o} ${h - o} L${CUT + 0.2} ${h - o} L${o} ${h - CUT - 0.2} Z`;
      svgEl.setAttribute("width", String(w));
      svgEl.setAttribute("height", String(h));
      for (const p of paths) p.setAttribute("d", d);
      perimeter = paths[0].getTotalLength();
      toRight = h + w - 2 * CUT + CUT * Math.SQRT2;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cardEl);

    /** Draws the comet on the card's edge: its head `s` pixels round from the start, its tail `len` long (which can be 0). */
    const drawRing = (s: number, len: number) => {
      const head = ((s % perimeter) + perimeter) % perimeter;
      paths.forEach((p, i) => {
        const l = Math.max(0, (len * (i + 1)) / paths.length);
        p.style.strokeDasharray = `${l} ${Math.max(1, perimeter - l)}`;
        p.style.strokeDashoffset = String(l - head);
        p.style.opacity = l < 0.5 ? "0" : "1";
      });
    };
    const hideRing = () => {
      for (const p of paths) p.style.opacity = "0";
    };
    const showComet = (head: number) => {
      cometEl.style.opacity = "1";
      cometEl.style.transform = `translate3d(${head - TAIL}px, 0, 0)`;
    };
    const hideComet = () => {
      cometEl.style.opacity = "0";
    };

    let phase: Phase = "idle";
    let hovering = false;
    let frame = 0;
    let last = 0;
    let x = 0; // the comet's head along the line, px from the line's left end
    let s = 0; // the comet's head round the card, px from the middle of the left edge (counted on through every lap)
    let tail = 0; // how much tail the card's edge is showing now

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const lr = lineEl.getBoundingClientRect();
      const cr = cardEl.getBoundingClientRect();
      const leftEdge = cr.left - lr.left;
      const rightEdge = cr.right - lr.left;

      if (phase === "enter") {
        x += SPEED * dt;
        if (x >= leftEdge) {
          // At the card: the light turns onto the border at the middle of the left edge, its tail growing as it goes.
          phase = "orbit";
          s = 0;
          tail = 0;
          hideComet();
        } else showComet(x);
      } else if (phase === "orbit") {
        const before = s;
        s += SPEED * dt * (hovering ? 1 : FINISH);
        tail = Math.min(TAIL, s);
        drawRing(s, tail);
        // The way out is the middle of the right edge: once the pointer has gone, leave the next time the head gets there.
        if (!hovering && Math.floor((s - toRight) / perimeter) > Math.floor((before - toRight) / perimeter)) {
          phase = "drain";
          s = toRight + (Math.floor((before - toRight) / perimeter) + 1) * perimeter; // sit exactly on the exit
        }
      } else if (phase === "drain") {
        // The head waits at the exit while the tail on the card's edge is drawn in behind it, and the light steps out onto the line.
        tail -= SPEED * FINISH * dt;
        if (tail <= 0) {
          hideRing();
          phase = "exit";
          x = rightEdge;
        } else drawRing(s, tail);
      } else if (phase === "exit") {
        x += SPEED * dt;
        if (x - TAIL > lr.width) {
          hideComet();
          phase = "idle";
          if (hovering) start();
        } else showComet(x);
      }

      if (phase !== "idle") frame = requestAnimationFrame(tick);
    };

    function start() {
      if (phase !== "idle") return;
      phase = "enter";
      x = 0;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }

    const enter = () => {
      hovering = true;
      start();
    };
    const leave = () => {
      hovering = false;
    };
    cardEl.addEventListener("pointerenter", enter);
    cardEl.addEventListener("pointerleave", leave);
    return () => {
      cardEl.removeEventListener("pointerenter", enter);
      cardEl.removeEventListener("pointerleave", leave);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="relative isolate" {...rest}>
      {/* The line: as wide as the screen, centred on the card, and behind it (the card's fill hides the part it crosses). */}
      <div ref={line} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 -z-10 -ml-[50vw] h-px w-screen overflow-hidden bg-border">
        <span ref={comet} className="absolute top-0 left-0 opacity-0" style={{ width: TAIL, height: 2, marginTop: -0.5, background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary) 80%, transparent) 70%, color-mix(in srgb, var(--primary) 55%, white))", boxShadow: "0 0 10px var(--primary)" }} />
      </div>
      <div ref={card} className={cn("cut-card relative", className)}>
        {children}
        {/* The light on the card's edge: the same outline as the card, drawn as stacked strokes that end at the head. */}
        <svg ref={svg} aria-hidden className="pointer-events-none absolute -top-px -left-px z-20 overflow-visible" style={{ filter: "drop-shadow(0 0 5px var(--primary))" }}>
          {Array.from({ length: LAYERS }, (_, i) => (
            <path key={i} ref={(el) => void (layers.current[i] = el)} fill="none" stroke={i === 0 ? "color-mix(in srgb, var(--primary) 55%, white)" : "var(--primary)"} strokeWidth={i === 0 ? 2.6 : 2} strokeOpacity={i === 0 ? 0.95 : 0.2} style={{ opacity: 0 }} />
          ))}
        </svg>
      </div>
    </div>
  );
}
