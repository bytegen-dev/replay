import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { FooterScrub } from "@/components/FooterScrub";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ThemeSelector } from "@/components/ThemeSelector";

const PAGES = [
  { label: "Wayback", href: "/wayback" },
  { label: "Play", href: "/play" },
  { label: "Docs", href: "/docs" },
];
const LINKS = [
  { label: "GitHub", href: "https://github.com/bytegen-dev" },
  { label: "X / Twitter", href: "https://x.com/bytegen_dev" },
];

/**
 * The footer is a video-player strip: links and fine print, then the wordmark as a timeline you can scrub. The wordmark is
 * whole and sits inside the footer, so nothing is cut off when a phone lets you rubber-band past the bottom.
 */
export function SiteFooter() {
  const link = "text-muted-foreground transition-colors hover:text-primary";
  return (
    <footer className="overscroll-bottom relative z-10 mt-16 shrink-0 border-t border-border bg-background sm:mt-24">
      <div className="mx-auto w-full max-w-6xl px-[max(1rem,env(safe-area-inset-left))] pt-8 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-10 sm:pb-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BrandMark size={28} className="size-7 shrink-0 object-contain" />
            <span className="font-heading text-lg font-bold">Replay</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {PAGES.map((l) => (
              <Link key={l.href} href={l.href} className={link}>
                {l.label}
              </Link>
            ))}
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={link}>
                {l.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <p className="text-xs leading-relaxed text-muted-foreground sm:whitespace-nowrap sm:text-sm">Historical prices are indicative only. Not financial advice.</p>
          <div className="flex shrink-0 items-center gap-3">
            <ThemeSelector compact className="w-44" />
            <SettingsDialog />
          </div>
        </div>

        <div className="mt-10 sm:mt-14">
          <FooterScrub />
        </div>
      </div>
    </footer>
  );
}
