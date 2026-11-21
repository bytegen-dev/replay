"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { openGameFromLink } from "@/lib/viewerClient.ts";

const LINKS = [
  { href: "/#trade", label: "Trade" },
  { href: "/wayback", label: "Wayback" },
  { href: "/game", label: "Game" },
  { href: "/docs", label: "Docs" },
];

const EXTERNAL = [
  { href: "https://github.com/bytegen-dev", label: "GitHub" },
];

/**
 * The tools and links in line with the header on a wide screen. One bar sits under the current tool and slides, with a
 * springy overshoot, to whichever link is hovered or focused, then back. Phones use the menu drawer instead.
 */
export function SiteNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const activeKey = LINKS.find((l) => (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)))?.href ?? null;
  const [hovered, setHovered] = useState<string | null>(null);
  const target = hovered ?? activeKey;
  const [bar, setBar] = useState<{ left: number; width: number; top: number } | null>(null);
  // The first placement jumps into position; only later moves slide.
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const el = target ? itemRefs.current[target] : null;
    setBar(el ? { left: el.offsetLeft, width: el.offsetWidth, top: el.offsetTop + el.offsetHeight + 3 } : null);
  }, [target]);

  useEffect(() => {
    const id = setTimeout(measure, 0);
    return () => clearTimeout(id);
  }, [measure]);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 120);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measure]);

  const hoverProps = (key: string) => ({
    ref: (el: HTMLElement | null) => {
      itemRefs.current[key] = el;
    },
    onMouseEnter: () => setHovered(key),
    onFocus: () => setHovered(key),
    onBlur: () => setHovered(null),
  });

  return (
    <nav ref={navRef} aria-label="Tools" onMouseLeave={() => setHovered(null)} className="relative flex shrink-0 items-center gap-6 text-sm">
      {LINKS.map((l) => {
        const active = l.href === activeKey;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            onClick={l.href === "/game" ? openGameFromLink : undefined}
            {...hoverProps(l.href)}
            className={cn("transition-colors hover:text-foreground", active ? "font-bold text-foreground" : "text-muted-foreground", hovered === l.href && "text-foreground")}
          >
            {l.label}
          </Link>
        );
      })}
      {EXTERNAL.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" {...hoverProps(l.label)} className={cn("text-muted-foreground transition-colors hover:text-foreground", hovered === l.label && "text-foreground")}>
          {l.label}
        </a>
      ))}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 h-0.5 bg-foreground"
        style={{
          top: bar?.top ?? 0,
          width: bar?.width ?? 0,
          transform: `translateX(${bar?.left ?? 0}px)`,
          opacity: bar ? 1 : 0,
          // An overshooting curve is what makes the slide elastic: it runs past the target and settles back.
          transition: ready ? "transform 560ms cubic-bezier(0.34, 1.7, 0.5, 1), width 560ms cubic-bezier(0.34, 1.7, 0.5, 1), opacity 160ms ease" : "none",
        }}
      />
    </nav>
  );
}
