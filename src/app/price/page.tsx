import type { Metadata } from "next";
import { PricePanel } from "@/components/PricePanel";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Price lookup",
  description: "The price of a token or stock at any past date and time.",
};

export default function PricePage() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          What was a token or stock worth at a past date and time? Type the date the way you would say it. The price is the last trade before that moment, to the minute where the data allows.
        </p>
        <PricePanel />
      </main>

      <SiteFooter />
    </div>
  );
}
