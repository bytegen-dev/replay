import { DcaApp } from "@/components/DcaApp";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />

      <main className="stagger-in mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-10">
        <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl">Wayback Machine</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Model a fixed monthly purchase of any stock or token, month by month. Edit missing prices, then export a spreadsheet.
        </p>
        <DcaApp />
      </main>

      <SiteFooter />
    </div>
  );
}