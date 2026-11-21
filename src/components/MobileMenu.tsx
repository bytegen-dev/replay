"use client";

import { ArrowLeftRight, ArrowUpRight, BookOpen, History } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GithubIcon, XIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/utils";
import { AUTH_CHANGED_EVENT, openSignIn, useViewer } from "@/lib/viewerClient.ts";

const TOOLS = [
  { href: "/#trade", label: "Trade", note: "Paper and live trading, coming soon", Icon: ArrowLeftRight },
  { href: "/wayback", label: "Wayback", note: "Past buys and the price on any day", Icon: History },
  { href: "/docs", label: "Docs", note: "Guides and the public API", Icon: BookOpen },
];
const LINKS = [
  { href: "https://x.com/bytegen_dev", label: "X / Twitter", note: "Updates and news", Icon: XIcon },
  { href: "https://github.com/bytegen-dev", label: "GitHub", note: "bytegen-dev", Icon: GithubIcon },
];

const EASE = "transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease";
/** The icon turns a half turn (and a little more) as it becomes the X, with a slight overshoot. The cross looks the same upright or turned. */
const SPIN = "transform 0.55s cubic-bezier(0.34, 1.35, 0.5, 1)";
/** One bar of the icon. Each turns about its own centre. */
const bar = (y: number, transform: string, opacity = 1) => ({ transformBox: "fill-box" as const, transformOrigin: "center", transform, opacity, transition: EASE, y });

/**
 * The hamburger and the X are one button: three level bars that turn into a cross in place. The menu and its backdrop
 * sit above the header, so the button is lifted out of the header (it floats at the same spot, above both) to stay visible.
 */
function MorphIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden focusable={false}>
      {/* Short, long, short bars, level when closed; crossed when open. */}
      <g style={{ transformOrigin: "12px 12px", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: SPIN }}>
        <line x1="7" x2="17" y1="7" y2="7" style={bar(7, open ? "translateY(5px) rotate(45deg) scaleX(1.5)" : "none")} />
        <line x1="4" x2="20" y1="12" y2="12" style={bar(12, open ? "scaleX(0.2)" : "none", open ? 0 : 1)} />
        <line x1="7" x2="17" y1="17" y2="17" style={bar(17, open ? "translateY(-5px) rotate(-45deg) scaleX(1.5)" : "none")} />
      </g>
    </svg>
  );
}

/** Phone-only menu: a three-bar button in the header that morphs into an X and slides a drawer in from the right. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const viewer = useViewer();
  // The floating button is added after mount, since it lives on <body> rather than inside the header.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);
  const pathname = usePathname();
  const close = () => setOpen(false);
  // Items rise in one after another once the drawer is open.
  const enter = (i: number) => ({ animation: `rise 0.4s cubic-bezier(0.2, 0.7, 0.2, 1) ${100 + i * 60}ms both` });

  // The page behind doesn't scroll while the menu is open.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  return (
    // Not modal: the button above the dim stays clickable, so the same button can close the menu.
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      {/* Keeps the header's layout while the real button floats above it. */}
      <span aria-hidden className="size-9 shrink-0 sm:hidden" />
      {mounted &&
        createPortal(
          <button
              type="button"
              data-menu-toggle
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-[70] grid size-9 place-items-center text-foreground hover:text-primary sm:hidden"
            >
              <MorphIcon open={open} />
            </button>,
          document.body,
        )}
      <DialogPrimitive.Portal>
        {open && <div aria-hidden className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm animate-in fade-in-0 sm:hidden" />}
        <DialogPrimitive.Content
          onInteractOutside={(e) => {
            // The toggle sits outside the drawer; its own click handles open/close.
            if ((e.target as Element | null)?.closest?.("[data-menu-toggle]")) e.preventDefault();
          }}
          className="fixed inset-y-0 right-0 z-[65] flex w-[88%] max-w-sm flex-col overflow-y-auto border-l border-border bg-card px-5 pt-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-200 sm:hidden"
          style={{ backgroundImage: "radial-gradient(120% 60% at 100% 0%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 60%)" }}
        >
          <span className="font-heading absolute top-[max(0.75rem,env(safe-area-inset-top))] left-5 flex h-9 items-center text-sm text-muted-foreground" aria-hidden>
            Menu
          </span>
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Pages and links</DialogPrimitive.Description>

          <nav aria-label="Tools" className="flex flex-col gap-2">
            {TOOLS.map(({ href, label, note, Icon }, i) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  style={enter(i)}
                  className={cn("group relative flex items-center gap-4 border px-4 py-4 transition-colors", active ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-secondary/60")}
                >
                  {/* The page you are on wears the dotted texture (a plain rectangle, so no cut corners). */}
                  {active && <span aria-hidden className="tex-layer" style={{ "--cut": "0px" } as React.CSSProperties} />}
                  <Icon className={cn("relative z-10 size-6 shrink-0 transition-transform group-hover:scale-110 group-active:scale-95", active ? "text-primary" : "text-muted-foreground group-hover:text-primary")} aria-hidden />
                  <span className="relative z-10 min-w-0">
                    <span className="font-heading block text-xl leading-tight font-bold">{label}</span>
                    <span className="block text-xs text-muted-foreground">{note}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="my-6 h-px bg-border" style={enter(TOOLS.length)} />

          {viewer?.canSignIn && viewer.kind !== "trusted" && (
            <div className="mb-4 flex items-center justify-between gap-3 border border-border px-4 py-3" style={enter(TOOLS.length + 1)}>
              {viewer.kind === "user" ? (
                <>
                  <span className="min-w-0 truncate text-sm">{viewer.email}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch("/api/auth/signout", { method: "POST" });
                      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
                      close();
                    }}
                    className="shrink-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">More checks each day when you sign in</span>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      setTimeout(() => openSignIn(), 250);
                    }}
                    className="shrink-0 text-sm font-bold text-primary underline underline-offset-4"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          )}

          <nav aria-label="More" className="flex flex-col">
            {LINKS.map(({ href, label, note, Icon }, i) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" onClick={close} style={enter(TOOLS.length + 1 + i)} className="group flex items-center gap-4 py-3 text-foreground">
                <Icon className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="font-heading block text-base font-bold leading-tight">{label}</span>
                  <span className="block text-xs text-muted-foreground">{note}</span>
                </span>
                <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
              </a>
            ))}
          </nav>

          <p className="mt-auto pt-8 text-xs text-muted-foreground" style={enter(TOOLS.length + LINKS.length + 1)}>
            Historical prices are indicative only. Not financial advice.
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
