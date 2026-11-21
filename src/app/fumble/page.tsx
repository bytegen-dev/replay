import type { Metadata } from "next";
import { FumbleTool } from "@/components/FumbleTool";
import { RollText } from "@/components/RollText";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SpotlightText } from "@/components/SpotlightText";
import { pageMeta } from "@/lib/site.ts";

const TITLE = "Fumble check: what your Solana sells left on the table";
const DESCRIPTION = "Paste a Solana wallet. See every coin it sold, and how much more those coins were worth at their highest price afterwards.";

export const metadata: Metadata = pageMeta({ title: TITLE, fullTitle: `${TITLE} | Replay`, description: DESCRIPTION, path: "/fumble" });

export default function FumblePage() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />

      <main className="stagger-in mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-10">
        <h1 className="font-heading text-4xl font-medium tracking-tight sm:text-6xl">
          <RollText text="Fumble check" introDelay={60} />
        </h1>
        <SpotlightText className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base" text="Paste a Solana wallet. See what every sell left on the table." />
        <FumbleTool />
      </main>

      <SiteFooter />
    </div>
  );
}
