import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/** A page of fine print: the site's header and footer around a title, the date it was last changed, and plain sections. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-8 pr-[max(1rem,env(safe-area-inset-right))] pb-16 sm:px-6 sm:py-12 sm:pb-24">
        <h1 className="font-heading text-4xl font-medium tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last changed {updated}</p>
        <p className="mt-6 text-sm leading-relaxed sm:text-base">{intro}</p>
        <div className="mt-8 flex flex-col gap-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** One titled section of a legal page. */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground sm:text-base [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
      <h2 className="font-heading text-xl font-bold text-foreground sm:text-2xl">{title}</h2>
      {children}
    </section>
  );
}
