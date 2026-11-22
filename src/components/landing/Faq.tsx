"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { SpotlightText } from "@/components/SpotlightText";
import { cn } from "@/lib/utils";

export interface FaqItem {
  q: string;
  a: string;
  topic: string;
}

/**
 * The questions as a small tool of their own: topics on the left filter the list, one answer is open at a time and slides
 * open smoothly, and the open row is marked with a mint bar that grows down its edge. Closed answers stay in the page for
 * search engines and screen readers (the page also publishes them as structured data).
 */
export function Faq({ items, title }: { items: FaqItem[]; title?: React.ReactNode }) {
  const topics = ["All", ...Array.from(new Set(items.map((i) => i.topic)))];
  const [topic, setTopic] = useState("All");
  const [open, setOpen] = useState<string | null>(items[0]?.q ?? null);
  const base = useId();
  // The outline around the chosen topic is one shared box that slides from chip to chip.
  const chips = useRef<Record<string, HTMLButtonElement | null>>({});
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [slide, setSlide] = useState(false);
  const measure = () => {
    const el = chips.current[topic];
    if (!el) return;
    const next = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    // Keep the old object when nothing moved, so measuring never causes another render.
    setBox((b) => (b && b.x === next.x && b.y === next.y && b.w === next.w && b.h === next.h ? b : next));
  };
  useLayoutEffect(measure, [topic]);
  useEffect(() => {
    // Only slide once the box has been placed, so it does not fly in from the corner on load.
    const id = requestAnimationFrame(() => setSlide(true));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // On wide screens the left column sticks as you scroll. Once it is stuck the list is rising up beside the title, so the title shrinks to fit the column.
  const column = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = column.current;
    if (!el) return;
    const check = () => {
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const top = parseFloat(getComputedStyle(el).top) || 0;
      setStuck(wide && el.getBoundingClientRect().top <= top + 1);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);
  // The chip row scrolls sideways on a phone: it fades at an edge only when there is more beyond it.
  const row = useRef<HTMLDivElement>(null);
  // Dragging the row with the mouse scrolls it (a finger already does). A press that moves a few pixels becomes a drag, and the click that follows it
  // is swallowed, so letting go over a chip does not pick that topic.
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const fades = () => {
    const el = row.current;
    if (!el) return;
    el.style.setProperty("--fl", el.scrollLeft > 2 ? "2.5rem" : "0px");
    el.style.setProperty("--fr", el.scrollLeft < el.scrollWidth - el.clientWidth - 2 ? "2.5rem" : "0px");
  };
  useEffect(fades, []);
  const shown = items.filter((i) => topic === "All" || i.topic === topic);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14">
      <div ref={column} className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
        {/* The section title is part of what sticks, so the column holds from the title and not from the line under it. On wide screens it starts full size, running on past the column with the list below it, and shrinks once the column is stuck. */}
        {title && <div className={cn("lg:whitespace-nowrap lg:[&_h2]:transition-[font-size] lg:[&_h2]:duration-300 motion-reduce:lg:[&_h2]:transition-none", stuck && "lg:[&_h2]:text-2xl")}>{title}</div>}
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed whitespace-nowrap text-muted-foreground">
            Not here? Read the{" "}
            <Link href="/docs" className="underline underline-offset-4 transition-colors hover:text-foreground">
              docs
            </Link>
            .
          </p>
        </div>
        <div role="group" aria-label="Filter the questions by topic" ref={row}
          onScroll={fades}
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse" || e.button !== 0 || !row.current) return;
            drag.current = { x: e.clientX, left: row.current.scrollLeft, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const el = row.current;
            if (!d || !el) return;
            const dx = e.clientX - d.x;
            if (!d.moved && Math.abs(dx) > 5) {
              d.moved = true;
              el.setPointerCapture(e.pointerId);
            }
            if (d.moved) el.scrollLeft = d.left - dx;
          }}
          onPointerUp={(e) => {
            if (drag.current?.moved) row.current?.releasePointerCapture(e.pointerId);
          }}
          onClickCapture={(e) => {
            if (drag.current?.moved) {
              e.preventDefault();
              e.stopPropagation();
            }
            drag.current = null;
          }}
          className="relative -mx-4 flex cursor-grab gap-2 overflow-x-auto px-4 select-none active:cursor-grabbing lg:cursor-auto lg:select-auto [mask-image:linear-gradient(to_right,transparent,#000_var(--fl,0px),#000_calc(100%-var(--fr,2.5rem)),transparent)] [scrollbar-width:none] lg:mx-0 lg:flex-col lg:items-start lg:overflow-visible lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden">
          {box && (
            <span
              aria-hidden
              className={cn("pointer-events-none absolute top-0 left-0 border border-primary", slide && "transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none")}
              style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }}
            />
          )}
          {topics.map((t) => (
            <button
              key={t}
              ref={(el) => {
                chips.current[t] = el;
              }}
              type="button"
              aria-pressed={topic === t}
              onClick={() => {
                setTopic(t);
                // Keep an open answer open only if it is still in the list; otherwise open the first one shown.
                const next = items.filter((i) => t === "All" || i.topic === t);
                if (!next.some((i) => i.q === open)) setOpen(next[0]?.q ?? null);
              }}
              className={cn("relative flex shrink-0 items-center gap-2 border px-3 py-1.5 text-sm transition-colors duration-300", topic === t ? "border-transparent text-primary" : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground")}
            >
              {t}
              <span className="text-xs tabular-nums text-muted-foreground">{t === "All" ? items.length : items.filter((i) => i.topic === t).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col border-t border-border lg:mt-[4.5rem]">
        {shown.map((f, i) => {
          const isOpen = open === f.q;
          const id = `${base}-${i}`;
          return (
            <div key={f.q} className={cn("relative border-b border-border transition-[background-color,backdrop-filter] duration-500", isOpen ? "bg-primary/[0.05] backdrop-blur-md" : "bg-transparent backdrop-blur-none")} data-reveal-on-scroll style={{ "--d": i * 70 } as React.CSSProperties}>
              {/* The mint bar down the open row's left edge grows from the top. */}
              <span aria-hidden className={cn("absolute top-0 left-0 h-full w-0.5 origin-top bg-primary transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", isOpen ? "scale-y-100" : "scale-y-0")} />
              <button
                type="button"
                id={`${id}-q`}
                aria-expanded={isOpen}
                aria-controls={`${id}-a`}
                onClick={() => setOpen(isOpen ? null : f.q)}
                className={cn("group/q flex w-full items-center justify-between gap-6 py-5 pr-3 pl-4 text-left text-base font-bold transition-colors duration-300 sm:text-lg", isOpen ? "text-primary" : "hover:text-primary")}
              >
                <span className={cn("flex flex-col gap-1 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]", isOpen ? "translate-x-1" : "group-hover/q:translate-x-1")}>
                  <span className="text-[11px] font-normal tracking-wide text-muted-foreground">{f.topic}</span>
                  {f.q}
                </span>
                <span aria-hidden className={cn("relative size-5 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", isOpen && "rotate-45")}>
                  <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-current" />
                  <span className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-current" />
                </span>
              </button>
              {/* The answer slides open by animating its row height from 0 to its natural size. */}
              <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} className={cn("grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  <SpotlightText className="max-w-2xl pb-6 pl-5 text-sm leading-relaxed text-muted-foreground sm:text-base" text={f.a} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
