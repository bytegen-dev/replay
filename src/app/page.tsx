import Image from "next/image";
import { DcaApp } from "@/components/DcaApp";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

export default function Home() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-[max(1rem,env(safe-area-inset-left))] py-4 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-6 sm:py-5">
          <Image
            src="/dca-logo.png"
            alt="DCA"
            width={48}
            height={48}
            className="size-10 shrink-0 object-contain sm:size-12"
            priority
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Backtest
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">DCA</h1>
          </div>
          <SiteNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-10">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Model a fixed monthly purchase of any stock or token, month by month. Edit missing prices, then export a spreadsheet.
        </p>
        <DcaApp />
      </main>

      <SiteFooter />
    </div>
  );
}