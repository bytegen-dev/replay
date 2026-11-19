import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SubscribeDialog } from "@/components/SubscribeDialog";

/**
 * One header for every page: the name on the left, Subscribe on the right, the tools and links underneath on a phone
 * and in line with them on a wide screen. It sticks to the top and blurs what scrolls behind it.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:flex-nowrap sm:px-6 sm:py-4">
        <Link href="/" className="flex flex-1 items-center gap-3 sm:flex-none" aria-label="DCA home">
          <Image src="/dca-logo.png" alt="" width={40} height={40} priority className="size-9 shrink-0 object-contain sm:size-10" />
          <span className="text-2xl font-bold tracking-tight sm:text-3xl">DCA</span>
        </Link>
        <div className="order-3 w-full sm:order-2 sm:ml-auto sm:w-auto">
          <Suspense fallback={<div className="h-5" />}>
            <SiteNav />
          </Suspense>
        </div>
        <div className="order-2 sm:order-3">
          <SubscribeDialog />
        </div>
      </div>
    </header>
  );
}
