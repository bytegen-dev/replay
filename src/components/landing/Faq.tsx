"use client";

import Link from "next/link";
import { useId, useState } from "react";
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
export function Faq({ items }: { items: FaqItem[] }) {
  const topics = ["All", ...Array.from(new Set(items.map((i) => i.topic)))];
  const [topic, setTopic] = useState("All");
  const [open, setOpen] = useState<string | null>(items[0]?.q ?? null);
  const base = useId();
  const shown = items.filter((i) => topic === "All" || i.topic === topic);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14">
      <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed whitespace-nowrap text-muted-foreground">
            Not here? Read the{" "}
            <Link href="/docs" className="underline underline-offset-4 transition-colors hover:text-foreground">
              docs
            </Link>
            .
          </p>
        </div>
        <div role="group" aria-label="Filter the questions by topic" className="-mx-4 flex gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] [scrollbar-width:none] lg:mx-0 lg:flex-col lg:items-start lg:overflow-visible lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden">
          {topics.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={topic === t}
              onClick={() => {
                setTopic(t);
                // Keep an open answer open only if it is still in the list; otherwise open the first one shown.
                const next = items.filter((i) => t === "All" || i.topic === t);
                if (!next.some((i) => i.q === open)) setOpen(next[0]?.q ?? null);
              }}
              className={cn("relative flex shrink-0 items-center gap-2 border px-3 py-1.5 text-sm transition-colors duration-300", topic === t ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground")}
            >
              {t}
              <span className="text-xs tabular-nums text-muted-foreground">{t === "All" ? items.length : items.filter((i) => i.topic === t).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col border-t border-border">
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
