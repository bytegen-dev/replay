"use client";

import { useEffect, useState } from "react";
import { scramble } from "@/components/RollText";
import { motionReduced } from "@/lib/settings.ts";

/** The words the headline's last word goes through, and how long each one stays. "money" is the real one: it comes back and rests longest. */
const WORDS = ["money", "finances", "crypto", "fiat"];
const HOLD = [5200, 1900, 1900, 1900];
/** The first word waits for the headline's own entrance to finish before the first change. */
const FIRST_EXTRA = 1500;
/** Milliseconds per letter: a word is rubbed out a little faster than the next is typed. */
const ERASE_MS = 55;
const TYPE_MS = 95;
/** The letter of each word that is drawn twice as wide (its place in the word, from 0): the o in crypto, the a in fiat, the e in money, the c in finances. */
const STRETCH: Record<string, number> = { money: 3, finances: 5, crypto: 5, fiat: 2 };
/** A beat between the last letter going and the first of the next coming. */
const PAUSE_MS = 180;

/**
 * The headline's last word, with its full stop, which is typed out: the word is deleted letter by letter, then the next is typed in,
 * with a caret while it works. The first word enters with the other words of the headline (`index` is its place in that row). With
 * reduced motion it stays "money".
 */
export function RotatingWord({ index }: { index: number }) {
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(WORDS[0].length);
  const [busy, setBusy] = useState(false);
  // The glitch of the long "e" in "money": once, a couple of seconds after the word has come back and stopped pulsing. It shakes and flickers through other letters.
  const [glitching, setGlitching] = useState(false);
  const [glitchChar, setGlitchChar] = useState<string | null>(null);
  // True for a moment after "money" has been typed back in: it flickers like a bulb coming on (the big 4 on the page does the same).
  const [flicker, setFlicker] = useState(false);

  useEffect(() => {
    if (motionReduced()) return;
    let timer = 0;
    let cancelled = false;
    // Timers for the flicker and the glitch that follows it, so leaving the page stops them too.
    const side: number[] = [];
    let flickerId = 0;
    const wait = (ms: number, then: () => void) => {
      timer = window.setTimeout(() => {
        if (!cancelled) then();
      }, ms);
    };
    const run = (word: number) => {
      // Hold, then rub the word out…
      wait(word === 0 ? HOLD[0] + FIRST_EXTRA : HOLD[word], () => {
        setBusy(true);
        let n = WORDS[word].length;
        const erase = () => {
          n -= 1;
          setShown(n);
          if (n > 0) wait(ERASE_MS, erase);
          else wait(PAUSE_MS, () => type((word + 1) % WORDS.length));
        };
        erase();
      });
    };
    // …then type the next one in.
    const type = (word: number) => {
      setAt(word);
      let n = 0;
      const add = () => {
        n += 1;
        setShown(n);
        if (n < WORDS[word].length) wait(TYPE_MS, add);
        else {
          setBusy(false);
          if (word === 0) {
            setFlicker(true);
            // The bulb flickers for 2s; two seconds after it has settled the long "e" glitches once.
            side.push(
              window.setTimeout(() => setFlicker(false), 2000),
              window.setTimeout(() => {
                if (cancelled) return;
                setGlitching(true);
                flickerId = window.setInterval(() => setGlitchChar(scramble(WORDS[0][STRETCH.money])), 45);
                side.push(
                  window.setTimeout(() => {
                    window.clearInterval(flickerId);
                    setGlitching(false);
                    setGlitchChar(null);
                  }, 180),
                );
              }, 4000),
            );
          }
          run(word);
        }
      };
      add();
    };
    run(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      side.forEach((id) => window.clearTimeout(id));
      window.clearInterval(flickerId);
    };
  }, []);

  const word = WORDS[at];
  return (
    <span className="word-mask">
      <span className={flicker ? "word-rise word-flicker" : "word-rise"} style={{ "--w": index } as React.CSSProperties}>
        {word
          .slice(0, shown)
          .split("")
          .map((ch, i) =>
            i === STRETCH[word] ? (
              <span key={i} className="stretch-letter" data-glitch={glitching && word === "money" ? "on" : undefined}>
                {glitching && glitchChar && word === "money" ? glitchChar : ch}
              </span>
            ) : (
              ch
            ),
          )}
        <span aria-hidden className={busy ? "type-caret" : "type-caret type-caret-idle"} />
        .
      </span>
    </span>
  );
}
