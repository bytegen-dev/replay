import Link from "next/link";
import { Suspense } from "react";
import { BrandMark } from "@/components/BrandMark";
import { MobileMenu } from "@/components/MobileMenu";
import { SiteNav } from "@/components/SiteNav";
import { SubscribeDialog } from "@/components/SubscribeDialog";

/**
 * One header for every page. On a wide screen: the name on the left, the tools and links in line, Subscribe on the
 * right. On a phone: the name, Subscribe and a hamburger that opens a drawer. It sticks to the top and blurs what scrolls behind it.
 */
export function SiteHeader() {
  return (
    <header className="overscroll-top sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-6 sm:px-6 sm:py-4">
        <Link href="/" className="group/logo flex flex-1 items-center gap-3 sm:flex-none" aria-label="Replay home">
          <BrandMark size={40} priority className="size-9 shrink-0 object-contain transition-transform duration-300 ease-out group-hover/logo:-rotate-6 group-hover/logo:scale-110 sm:size-11" />
          <span className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Replay</span>
        </Link>
        <div className="hidden sm:order-2 sm:ml-auto sm:block">
          <Suspense fallback={<div className="h-5" />}>
            <SiteNav />
          </Suspense>
        </div>
        <div className="sm:order-3 sm:ml-5">
          <SubscribeDialog />
        </div>
        <Suspense fallback={<div className="size-9 sm:hidden" />}>
          <MobileMenu />
        </Suspense>
      </div>
    </header>
  );
}
