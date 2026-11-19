import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PricePanel } from "@/components/PricePanel";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "Price lookup",
  description: "The price of a token or stock at any past date and time.",
};

export default function PricePage() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
            <Image src="/dca-logo.png" alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="text-[0.6rem] font-bold tracking-[0.18em] text-muted-foreground uppercase sm:text-[0.65rem] sm:tracking-[0.2em]">Price lookup</p>
              <span className="text-xl font-bold tracking-tight sm:text-3xl">Dripcast</span>
            </div>
          </Link>
          <SiteNav />
        </div>
      </header>

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
