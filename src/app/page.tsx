import { Clock, History, Share2, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HeroChart } from "@/components/landing/HeroChart";
import { LandingDemo } from "@/components/landing/LandingDemo";
import { SignInLink } from "@/components/landing/SignInLink";
import { WaitlistButton } from "@/components/landing/WaitlistButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { CURRENCIES } from "@/lib/fxCurrencies.ts";
import { demoChecks } from "@/lib/landingData.ts";
import { limitsFor } from "@/lib/limits.ts";

const TITLE = "Replay: see what a past buy would be worth today";
const DESCRIPTION = "Pick a stock, a coin or a currency and a date. Replay uses real daily prices to show what one buy, or a monthly habit, would have turned into.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/" },
};

const faqs = (anon: number, user: number) => [
  {
    q: "Where do the prices come from?",
    a: "Daily closing prices come from Yahoo Finance for stocks and ETFs, with Nasdaq as a backup, from Bitstamp and CoinGecko for coins, from GeckoTerminal and DexHunter for newer tokens, and from the Federal Reserve, the European Central Bank and the IMF for currencies. Every result names the source it used.",
  },
  {
    q: "How accurate are the results?",
    a: "They use real daily closes, adjusted for stock splits. Dividends count only when you choose to reinvest them. Fees, taxes and the gap between a close and the price you would have got are left out, so treat a result as a good guide, not a record of what would have happened.",
  },
  {
    q: "Which currencies can I use?",
    a: `${CURRENCIES.length} currencies, converted at each month's own rate. The rates are official or interbank rates, which can sit far from the rate you could get on the street.`,
  },
  {
    q: "How does leverage work?",
    a: "Each buy opens its own futures-style position, long or short, up to 100x. The model charges funding (10.95% a year by default) and a 0.045% fee each way, and closes a position when its margin runs out. It uses daily closes, so real trading can be harsher than the result shows.",
  },
  {
    q: "Is it free?",
    a: `Yes. Without an account you get ${anon} checks a day, and a free account raises that to ${user}. Joining the waitlist means an email when there is something new to try.`,
  },
  {
    q: "Do you keep my searches?",
    a: "No. A check is worked out when you ask and is not saved unless you share it as a link. To keep the service fair we count how many checks each visitor runs in a day, using a scrambled version of the network address.",
  },
  {
    q: "Can I use this data in my own app?",
    a: "Yes. The same lookups are available through a public API, with docs, and as a skill for AI assistants.",
  },
  {
    q: "Is this financial advice?",
    a: "No. A result describes the past and says nothing about what comes next.",
  },
];

export default function LandingPage() {
  const checks = demoChecks();
  const hero = checks.find((c) => c.id === "bitcoin-monthly") ?? checks[0];
  const anon = limitsFor("anonymous").day;
  const user = limitsFor("user").day;
  const questions = faqs(anon, user);
  const section = "mx-auto w-full max-w-6xl px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6";
  const h2 = "font-heading text-2xl font-bold tracking-tight sm:text-4xl";

  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* The hero: one promise, one action, and a real result drawing itself. */}
        <section className={`${section} grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-24`}>
          <div className="stagger-in flex flex-col gap-6">
            <h1 className="font-heading text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">See what a past buy would be worth today.</h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">Pick a stock, a coin or a currency and a date. Replay uses real daily prices to show what one buy, or a monthly habit, would have turned into.</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <WaitlistButton />
              <a href="#demo" className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">
                Try it first
              </a>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">Prices from Yahoo Finance, Bitstamp, CoinGecko, Nasdaq, the ECB and the Federal Reserve.</p>
          </div>
          {hero && <HeroChart check={hero} />}
        </section>

        {/* The live demo: both tools, with limits. */}
        <section id="demo" className={`${section} scroll-mt-24 py-10 sm:py-16`}>
          <div className="mb-6 flex max-w-2xl flex-col gap-2 sm:mb-8">
            <h2 className={h2}>Ask it something real.</h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">Hindsight answers from saved results, so they appear at once. Wayback runs a live lookup, which takes a second or two.</p>
          </div>
          <LandingDemo checks={checks} />
        </section>

        {/* How it works. */}
        <section className={`${section} py-10 sm:py-16`}>
          <h2 className={`${h2} mb-8 max-w-2xl sm:mb-10`}>Three steps from a question to an answer.</h2>
          <ol className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {[
              { n: "1", t: "Pick what and when", d: "Search a stock or a coin, or choose a currency pair, then a start month. Each result says how far back its data goes." },
              { n: "2", t: "Choose how you buy", d: "One buy at the start, or the same amount every month, quarter or year, on the day of the month you choose." },
              { n: "3", t: "Read what happened", d: "Money in, what it is worth now, a chart of the path, and a table with every month's price and source." },
            ].map((s) => (
              <li key={s.n} className="cut-card flex flex-col gap-3 border border-border bg-card p-5 sm:p-6">
                <span className="font-heading text-3xl font-bold text-primary tabular-nums">{s.n}</span>
                <h3 className="text-lg font-bold">{s.t}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* What is in it. */}
        <section className={`${section} py-10 sm:py-16`}>
          <h2 className={`${h2} mb-8 max-w-2xl sm:mb-10`}>Four ways to look at the past.</h2>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            {[
              { Icon: History, t: "Hindsight", d: "What a single buy or a monthly habit would be worth today, for stocks, coins and currencies, with dividends and currency conversion.", href: "/hindsight", cta: "Open Hindsight" },
              { Icon: Clock, t: "Wayback", d: "The price and market cap of a token or stock at a past moment, to the minute for recent dates.", href: "/wayback", cta: "Open Wayback" },
              { Icon: TrendingUp, t: "Leverage", d: "The same buys as futures-style positions, long or short, up to 100x, with funding, fees and liquidation.", href: "/hindsight", cta: "Try it in Hindsight" },
              { Icon: Share2, t: "Share and build", d: "Save a result as a link anyone can open, or call the same data from your own code with the public API.", href: "/docs", cta: "Read the docs" },
            ].map(({ Icon, t, d, href, cta }) => (
              <Link key={t} href={href} className="cut-card group flex flex-col gap-3 border border-border bg-card p-5 transition-transform duration-200 hover:-translate-y-0.5 sm:p-6">
                <Icon className="size-6 text-primary" aria-hidden />
                <h3 className="text-lg font-bold">{t}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{d}</p>
                <span className="mt-auto pt-2 text-sm underline decoration-border underline-offset-4 transition-colors group-hover:decoration-primary">{cta}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Free now, more with an account. */}
        <section className={`${section} py-10 sm:py-16`}>
          <div className="cut-card grid gap-8 border border-border bg-card p-5 sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
            <div className="flex flex-col gap-3">
              <h2 className={h2}>Free to try. More when you sign in.</h2>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">Everything on this page works without an account. Sign in with your email, with no password to remember, and the daily limit goes up. Saved checks and exports are next.</p>
              <SignInLink />
            </div>
            <div className="grid gap-px border border-border bg-border sm:grid-cols-2">
              <div className="flex flex-col gap-3 bg-card p-5">
                <h3 className="text-sm font-bold text-muted-foreground">Without an account</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  <li>{anon} checks a day</li>
                  <li>Ready-made examples</li>
                  <li>Wayback lookups</li>
                  <li>Leverage and short</li>
                </ul>
              </div>
              <div className="flex flex-col gap-3 bg-secondary p-5">
                <h3 className="text-sm font-bold text-primary">With an account</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  <li>{user} checks a day</li>
                  <li>All the free features</li>
                  <li className="text-muted-foreground">Saved checks, coming</li>
                  <li className="text-muted-foreground">Exports, coming</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Questions. */}
        <section className={`${section} py-10 sm:py-16`}>
          <h2 className={`${h2} mb-8 max-w-2xl`}>Questions people ask.</h2>
          <div className="mx-auto flex max-w-3xl flex-col border-t border-border lg:mx-0">
            {questions.map((f) => (
              <details key={f.q} className="group border-b border-border py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold sm:text-lg [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="shrink-0 text-xl text-primary transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{f.a}</p>
              </details>
            ))}
          </div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: questions.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
              }),
            }}
          />
        </section>

        {/* The last ask. */}
        <section className={`${section} py-10 sm:py-16`}>
          <div className="flex flex-col items-start gap-5 border-l-2 border-primary pl-5 sm:pl-8">
            <h2 className={`${h2} max-w-2xl`}>Be first when Replay opens up.</h2>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">Join the waitlist and we will email you when there is something new to try.</p>
            <WaitlistButton />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
