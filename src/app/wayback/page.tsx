import type { Metadata } from "next";
import { RollText } from "@/components/RollText";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SpotlightText } from "@/components/SpotlightText";
import { WaybackTools } from "@/components/WaybackTools";
import { pageMeta } from "@/lib/site.ts";

const TITLE = "Wayback: what a past buy would be worth today, and the price on any past day";
const DESCRIPTION = "Pick a stock, coin, commodity or currency and a date. See what one buy, or the same amount every month, would be worth today, or just the price on that day.";

export const metadata: Metadata = pageMeta({ title: TITLE, fullTitle: `${TITLE} | Replay`, description: DESCRIPTION, path: "/wayback" });

export default function WaybackPage() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />

      <main className="stagger-in mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-10">
        <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl"><RollText text="Wayback" introDelay={60} /></h1>
        <SpotlightText className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base" text="Go back to any day. See what a buy from then would be worth today, with a monthly habit and leverage if you like, or what a stock, coin, commodity or currency cost at that moment." />
        <WaybackTools />
      </main>

      <SiteFooter />
    </div>
  );
}
