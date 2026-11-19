"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Backtest" },
  { href: "/price", label: "Price lookup" },
];

/** The two tools, side by side in the header. The current one is underlined. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Tools" className="flex shrink-0 items-center gap-4 text-xs sm:gap-5 sm:text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn("underline-offset-8 hover:text-foreground hover:underline", active ? "font-bold text-foreground underline" : "text-muted-foreground")}
          >
            {l.label}
          </Link>
        );
      })}
      <a href="https://github.com/bytegen-dev/dripcast" target="_blank" rel="noopener noreferrer" className="text-muted-foreground underline-offset-8 hover:text-foreground hover:underline">
        Source
      </a>
    </nav>
  );
}
