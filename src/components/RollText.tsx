"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motionReduced } from "@/lib/settings.ts";

const DIGITS = "0123456789";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A random character of the same kind as `ch`, so a number flickers through digits and a month name through letters. */
export function scramble(ch: string): string {
  if (/[0-9]/.test(ch)) return DIGITS[Math.floor(Math.random() * DIGITS.length)];
  if (/[A-Za-z]/.test(ch)) {
    const r = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return ch === ch.toLowerCase() ? r.toLowerCase() : r;
  }
  return ch;
}

/** Runs the roll for `text`: every letter and digit flickers, then locks in from left to right. Returns a stop function. */
function startRoll(text: string, set: (s: string | null) => void, slow = 1): () => void {
  const start = performance.now();
  const id = setInterval(() => {
    const t = performance.now() - start;
    let done = true;
    const out = [...text].map((ch, i) => {
      if (!/[0-9A-Za-z]/.test(ch) || t >= (110 + i * 32) * slow) return ch;
      done = false;
      return scramble(ch);
    });
    set(done ? null : out.join(""));
    if (done) clearInterval(id);
  }, 45);
  return () => clearInterval(id);
}

/**
 * Text that rolls when it changes: each character flickers through random ones of the same kind, then locks in from left to
 * right (about half a second for a month and year). The first render is plain, and people who prefer reduced motion get the plain text
 * straight away. Spaces and punctuation never move, and the page font is monospaced, so nothing jitters sideways.
 * With `introDelay` the text is hidden at first, then rolls in once that many milliseconds have passed. `wide` lists the positions of
 * characters to draw twice as wide (a letter of a heading); they stay wide while the text rolls. A wide letter is stretched from its own
 * ink, not its box, so the gaps either side match the gaps between the other letters whatever the letter is (see `wideFit`).
 */
/**
 * How to stretch a letter to twice its width without uneven gaps. Scaling a letter's box doubles its side gaps too, so an "e" looked right
 * and a "c" (whose open side is all gap) did not. From the letter's measured ink: shift it back by its left gap, and make room for exactly
 * the ink's width, and the gap before it and the gap after it are the letter's normal ones. Sizes are in em, so they follow the font size.
 */
function wideFit(ctx: CanvasRenderingContext2D, ch: string, fontSize: number): { shift: number; room: number } | null {
  const m = ctx.measureText(ch);
  const left = -m.actualBoundingBoxLeft; // the gap between the letter's origin and where its ink starts
  const ink = m.actualBoundingBoxRight - left;
  if (!(ink > 0) || !(fontSize > 0)) return null;
  return { shift: left / fontSize, room: ink / fontSize };
}

export function RollText({ text, className, introDelay, introSlow = 1, wide }: { text: string; className?: string; introDelay?: number; introSlow?: number; wide?: number[] }) {
  const [rolling, setRolling] = useState<string | null>(null);
  const [hidden, setHidden] = useState(introDelay !== undefined);
  const before = useRef(text);
  const shell = useRef<HTMLSpanElement>(null);
  // For each wide position, how far to pull the stretched letter back and how much room to leave after it (em). Measured from the font in use.
  const [fits, setFits] = useState<Record<number, { shift: number; room: number }>>({});

  useLayoutEffect(() => {
    const el = shell.current;
    if (!el || !wide?.length) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const ctx = document.createElement("canvas").getContext("2d");
      const fontSize = parseFloat(cs.fontSize);
      if (!ctx) return;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const next: Record<number, { shift: number; room: number }> = {};
      for (const i of wide) {
        const fit = text[i] ? wideFit(ctx, text[i], fontSize) : null;
        if (fit) next[i] = fit;
      }
      setFits(next);
    };
    measure();
    // The first measure may be of a fallback font; measure again once the page's own fonts are in.
    void document.fonts?.ready.then(measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, wide?.join(",")]);

  useEffect(() => {
    if (introDelay === undefined) return;
    if (motionReduced()) {
      const id = setTimeout(() => setHidden(false), 0);
      return () => clearTimeout(id);
    }
    let stop = () => {};
    const id = setTimeout(() => {
      setHidden(false);
      stop = startRoll(before.current, setRolling, introSlow);
    }, introDelay);
    return () => {
      clearTimeout(id);
      stop();
    };
    // The intro plays once, when the text first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (before.current === text) return;
    before.current = text;
    if (motionReduced()) return;
    return startRoll(text, setRolling);
  }, [text]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span ref={shell} aria-hidden style={hidden ? { opacity: 0 } : undefined}>
        {wide?.length
          ? [...(rolling ?? text)].map((ch, i) =>
              wide.includes(i) ? (
                <span key={i} className="wide-letter" style={fits[i] ? { transform: `translateX(${-fits[i].shift}em) scaleX(2)`, marginRight: `${fits[i].room}em` } : undefined}>
                  {ch}
                </span>
              ) : (
                ch
              ),
            )
          : (rolling ?? text)}
      </span>
    </span>
  );
}
