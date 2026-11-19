"use client";

import { useEffect, useRef, useState } from "react";
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
function startRoll(text: string, set: (s: string | null) => void): () => void {
  const start = performance.now();
  const id = setInterval(() => {
    const t = performance.now() - start;
    let done = true;
    const out = [...text].map((ch, i) => {
      if (!/[0-9A-Za-z]/.test(ch) || t >= 110 + i * 32) return ch;
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
 * With `introDelay` the text is hidden at first, then rolls in once that many milliseconds have passed.
 */
export function RollText({ text, className, introDelay }: { text: string; className?: string; introDelay?: number }) {
  const [rolling, setRolling] = useState<string | null>(null);
  const [hidden, setHidden] = useState(introDelay !== undefined);
  const before = useRef(text);

  useEffect(() => {
    if (introDelay === undefined) return;
    if (motionReduced()) {
      const id = setTimeout(() => setHidden(false), 0);
      return () => clearTimeout(id);
    }
    let stop = () => {};
    const id = setTimeout(() => {
      setHidden(false);
      stop = startRoll(before.current, setRolling);
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
      <span aria-hidden style={hidden ? { opacity: 0 } : undefined}>
        {rolling ?? text}
      </span>
    </span>
  );
}
