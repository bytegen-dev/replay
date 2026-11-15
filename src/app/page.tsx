import Image from "next/image";
import { DcaApp } from "@/components/DcaApp";

export default function Home() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-[max(1rem,env(safe-area-inset-left))] py-4 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-6 sm:py-5">
          <Image
            src="/dca-logo.png"
            alt="DCA Checker"
            width={48}
            height={48}
            className="size-10 shrink-0 object-contain sm:size-12"
            priority
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.6rem] font-bold tracking-[0.18em] text-muted-foreground uppercase sm:text-[0.65rem] sm:tracking-[0.2em]">
              Backtest
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">DCA Checker</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-10">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Model a fixed monthly USD purchase for any token, month by month. Edit missing prices, then export a spreadsheet.
        </p>
        <DcaApp />
      </main>

      <footer className="relative z-10 mt-auto shrink-0 border-t border-border bg-background py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:py-6">
        <p className="mx-auto w-full max-w-6xl px-[max(1rem,env(safe-area-inset-left))] text-xs text-muted-foreground pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
          Historical prices are indicative only. Not financial advice.
        </p>
      </footer>
    </div>
  );
}