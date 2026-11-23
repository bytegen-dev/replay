import type { Metadata } from "next";
import { FumbleTool } from "@/components/FumbleTool";
import { RollText } from "@/components/RollText";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SpotlightText } from "@/components/SpotlightText";
import { pageMeta } from "@/lib/site.ts";

const TITLE = "Fumble check: what your Solana sells left on the table";
const DESCRIPTION = "Paste a Solana wallet. See every coin it sold, how much more those coins were worth afterwards, and how much profit it roundtripped.";

export const metadata: Metadata = pageMeta({ title: TITLE, fullTitle: `${TITLE} | Replay`, description: DESCRIPTION, path: "/fumble" });

export default function FumblePage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* The header and the page together fill exactly one screen, so the footer starts right at the fold and is only seen by scrolling down. On a very
          tall screen the height stops at 55rem, so the footer comes up into view instead of leaving a big empty band under the form. */}
      <div className="flex min-h-[min(100dvh,55rem)] flex-col">
        <SiteHeader />

        <main className="stagger-in mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] pb-16 sm:px-6 sm:py-10 sm:pb-24">
          {/* The heading is part of the tool, so the two can sit lower on the screen together until there is a scan to show. */}
          <FumbleTool
            className="mt-0"
            intro={
              <div className="flex flex-col gap-2">
                <h1 className="font-heading text-4xl font-medium tracking-tight sm:text-6xl">
                  <RollText text="Fumble check" introDelay={60} wide={[10]} glitch />
                </h1>
                <SpotlightText className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base" text="Paste a Solana wallet. See what every sell left on the table, and how much profit it roundtripped." />
              </div>
            }
          />
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
