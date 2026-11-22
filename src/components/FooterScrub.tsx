"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ScrollTopButton } from "@/components/ScrollTopButton";
import { GOLD_ENDS, GOLD_STARTS, goldPrice } from "@/lib/gold.ts";
import { encodeRange, shiftYm } from "@/lib/urlState.ts";

/** How far back the footer timeline goes. */
const START_YEAR = 2004;
const START = Date.UTC(START_YEAR, 0, 1);
/** Where the playhead rests until someone picks a date: halfway along the timeline. */
const REST = 0.5;

/**
 * The footer wordmark as a video-style scrubber. At rest the playhead sits halfway along the timeline. Move a
 * pointer (or drag a finger) across it and the fill follows, with the date under the playhead, so you can travel back through
 * the years. Vertical scrolling still works on touch. Click or tap to pin a month, and links below start a Wayback check from it:
 * pick a date, pick what you would have bought. The wordmark itself is decorative and hidden from screen readers.
 */
export function FooterScrub() {
  const box = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(REST);
  const [pinned, setPinned] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  // What is drawn: the pointer while it is moving, otherwise the pinned month, otherwise halfway.
  const p = active ? live : (pinned ?? REST);
  // The clock is read after mount so the server and browser agree on first paint.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);

  function move(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setActive(true);
    setLive(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  }
  function leave() {
    setActive(false);
  }
  // Letting go on a past date pins it; letting go at the far right clears it.
  function release() {
    if (active) setPinned(live > 0.985 ? null : live);
    setActive(false);
  }

  const label = p > 0.985 || now === null ? "Now" : new Date(START + p * (now - START)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const years = now === null ? [] : Array.from({ length: new Date(now).getUTCFullYear() - START_YEAR + 1 }, (_, i) => START_YEAR + i);
  // Fill and playhead snap while you drag, then glide back to the pinned month (or halfway) when you let go.
  const glide = active ? "none" : "clip-path 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), left 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)";

  // Gold's price for the month under the playhead ("Now" is the latest month with a price).
  const shownMonth = now === null ? null : p > 0.985 ? GOLD_ENDS : new Date(START + p * (now - START)).toISOString().slice(0, 7);
  const gold = shownMonth ? goldPrice(shownMonth) : null;
  const goldWhen = shownMonth ? new Date(`${shownMonth}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "";
  const goldSince = new Date(`${GOLD_STARTS}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

  const lastMonth = now === null ? null : shiftYm(new Date(now).toISOString().slice(0, 7), -1);
  const pickedMonth = pinned !== null && now !== null && lastMonth ? new Date(START + pinned * (now - START)).toISOString().slice(0, 7) : null;
  const start = pickedMonth && lastMonth && pickedMonth > lastMonth ? lastMonth : pickedMonth;
  const range = start && lastMonth ? encodeRange(start, lastMonth, lastMonth).range : null;
  const pickedLabel = start ? new Date(`${start}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : null;
  // Each link opens Wayback already filled with that asset, running from the picked month to last month.
  const choices = [
    { label: "S&P 500", q: "tab=stocks&s=SPY" },
    { label: "Apple", q: "tab=stocks&s=AAPL" },
    // Bitcoin's price history on Yahoo starts in late 2014.
    ...(start && start >= "2014-10" ? [{ label: "Bitcoin", q: "tab=crypto&coin=BTC-USD" }] : []),
    { label: "Euro", q: "tab=fx&from_ccy=USD&to_ccy=EUR" },
  ];

  return (
    <div>
    <div ref={box} aria-hidden onPointerMove={move} onPointerDown={move} onPointerLeave={leave} onPointerUp={release} onPointerCancel={leave} className="relative cursor-ew-resize touch-pan-y select-none">
      {/* Year ticks along the top. */}
      <div className="relative h-7 text-[10px] text-muted-foreground sm:text-xs">
        {now !== null &&
          years.map((y, i) => {
            const x = ((Date.UTC(y, 0, 1) - START) / (now - START)) * 100;
            // The first label starts at the left edge and a label near the right edge ends there, so neither hangs outside the content width.
            const edge = x < 0.5 ? "start" : x > 94 ? "end" : "mid";
            return (
              <span
                key={y}
                className={`absolute top-0 flex flex-col gap-1 ${edge === "start" ? "items-start" : edge === "end" ? "items-end" : "-translate-x-1/2 items-center"}`}
                style={edge === "end" ? { right: 0 } : { left: `${x}%` }}
              >
                <span className={i % 4 === 0 || edge === "end" ? "" : "invisible"}>{y}</span>
                <span className="h-1.5 w-px bg-border" />
              </span>
            );
          })}
      </div>

      <div className="relative">
        {/* The word: outlined, with a filled copy revealed up to the playhead. */}
        <svg viewBox="-2 0 1004 250" className="block w-full" focusable={false}>
          <text x="-14" y="215" textLength="1012" lengthAdjust="spacing" fontSize="270" fontWeight="700" className="font-heading" fill="none" stroke="var(--primary)" strokeWidth="3" strokeOpacity="0.55">
            REPLAY
          </text>
          <g style={{ clipPath: `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`, transition: glide }}>
            <text x="-14" y="215" textLength="1012" lengthAdjust="spacing" fontSize="270" fontWeight="700" className="font-heading" fill="var(--primary)">
              REPLAY
            </text>
          </g>
        </svg>

        {/* The playhead and its date. */}
        <div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${p * 100}%`, transition: glide.replace("clip-path 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), ", "") }}>
          <span
            className="absolute -top-1 -translate-y-full bg-primary px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-primary-foreground"
            style={{ left: p > 0.82 ? "auto" : 0, right: p > 0.82 ? 0 : "auto" }}
          >
            {label}
          </span>
        </div>
      </div>
    </div>

      {/* Gold's price in the month under the playhead, so the wordmark is also a quick look at what gold cost then. */}
      <div className="mt-3 flex min-h-8 flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="off">
        <span className="text-xs text-muted-foreground sm:text-sm">Gold, {goldWhen || "now"}</span>
        {gold !== null ? (
          <>
            <span className="font-heading text-xl font-bold text-primary tabular-nums sm:text-2xl">{gold.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span>
            <span className="text-xs text-muted-foreground sm:text-sm">an ounce</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground sm:text-sm">no price here, our gold history starts in {goldSince}</span>
        )}
        <ScrollTopButton className="ml-auto text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm" />
      </div>

      {/* Once a month is pinned on the timeline: what you picked, and one click to run it. */}
      {start && range && (
        <div className="mt-4 flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">
            Start from <b className="text-foreground">{pickedLabel}</b>
          </span>
          {choices.map((c) => (
            <Link key={c.label} href={`/wayback?${c.q}&range=${range}&run=1`} className="h-8 border border-border px-3 leading-8 transition-colors hover:border-primary hover:text-primary">
              {c.label}
            </Link>
          ))}
          <button type="button" onClick={() => setPinned(null)} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
