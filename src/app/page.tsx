import { SpotlightText } from "@/components/SpotlightText";
import Link from "next/link";
import { RollText } from "@/components/RollText";
import { DcaApp } from "@/components/DcaApp";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />

      <main className="stagger-in mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-10">
        <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl"><RollText text="Hindsight" introDelay={60} /></h1>
        <SpotlightText className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base" text="See what a buy from the past would be worth today. Pick a stock, coin or currency, buy once or on a schedule, and try leverage to see how it would have gone." />
        <p className="mt-2 text-sm text-muted-foreground">
          Just need the price on one day? Try <Link href="/wayback" className="underline underline-offset-4 hover:text-foreground">Wayback</Link>.
        </p>
        <DcaApp />
      </main>

      <SiteFooter />
    </div>
  );
}