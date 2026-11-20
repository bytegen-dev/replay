import type { Metadata } from "next";
import { SpotlightText } from "@/components/SpotlightText";
import Link from "next/link";
import { RollText } from "@/components/RollText";
import { PricePanel } from "@/components/PricePanel";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Wayback Machine",
  description: "The price of a token or stock at any past date and time.",
};

export default function PricePage() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />

      <main className="stagger-in mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl"><RollText text="Wayback Machine" introDelay={60} /></h1>
        <SpotlightText className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base" text="What was a token or stock worth at a past date and time? Type the date the way you would say it." />
        <p className="mt-2 text-sm text-muted-foreground">
          Want to know what a buy from then would be worth today? Try <Link href="/" className="underline underline-offset-4 hover:text-foreground">Hindsight</Link>.
        </p>
        <PricePanel />
      </main>

      <SiteFooter />
    </div>
  );
}
