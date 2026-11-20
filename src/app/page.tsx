import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/landing/Faq";
import { HindsightVisual, LeverageVisual, ShareVisual, WaybackVisual } from "@/components/landing/FeatureVisuals";
import { HeroChart } from "@/components/landing/HeroChart";
import { LandingDemo } from "@/components/landing/LandingDemo";
import { RevealObserver } from "@/components/landing/RevealObserver";
import { SignInLink } from "@/components/landing/SignInLink";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { StepVisual } from "@/components/landing/StepVisuals";
import { WaitlistButton } from "@/components/landing/WaitlistButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SpotlightText } from "@/components/SpotlightText";
import { SiteHeader } from "@/components/SiteHeader";
import { CURRENCIES } from "@/lib/fxCurrencies.ts";
import { demoChecks, heroChecks } from "@/lib/landingData.ts";
import { limitsFor } from "@/lib/limits.ts";

const TITLE = "Replay: see what a past buy would be worth today";
const DESCRIPTION = "Pick a stock, a coin or a currency and a date. Replay uses real daily prices to show what one buy, or a monthly habit, would have turned into.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/" },
};

/** A headline whose words rise out of their own mask, one after another. Each is a plain word to a screen reader. */
function WordRise({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((w, i) => (
    <span key={i}>
      <span className="word-mask">
        <span className="word-rise" style={{ "--w": i } as React.CSSProperties}>
          {w}
        </span>
      </span>
      {i < words.length - 1 && " "}
    </span>
  ));
}

/** The style for a part that waits to be scrolled to: --d is how many ms it holds back, so a row of cards arrives in turn. */
const later = (ms = 0) => ({ "--d": ms }) as React.CSSProperties;

const faqs = (anon: number, user: number) => [
  {
    q: "Where do the prices come from?",
    topic: "Data",
    a: "Daily closing prices come from Yahoo Finance for stocks and ETFs, with Nasdaq as a backup, from Bitstamp and CoinGecko for coins, from GeckoTerminal and DexHunter for newer tokens, and from the Federal Reserve, the European Central Bank and the IMF for currencies. Every result names the source it used.",
  },
  {
    q: "How accurate are the results?",
    topic: "Results",
    a: "They use real daily closes, adjusted for stock splits. Dividends count only when you choose to reinvest them. Fees, taxes and the gap between a close and the price you would have got are left out, so treat a result as a good guide, not a record of what would have happened.",
  },
  {
    q: "Which currencies can I use?",
    topic: "Data",
    a: `${CURRENCIES.length} currencies, converted at each month's own rate. The rates are official or interbank rates, which can sit far from the rate you could get on the street.`,
  },
  {
    q: "How does leverage work?",
    topic: "Leverage",
    a: "Each buy opens its own futures-style position, long or short, up to 100x. The model charges funding (10.95% a year by default) and a 0.045% fee each way, and closes a position when its margin runs out. It uses daily closes, so real trading can be harsher than the result shows.",
  },
  {
    q: "Is it free?",
    topic: "Account",
    a: `Yes. Without an account you get ${anon} checks a day, and a free account raises that to ${user}. Joining the waitlist means an email when there is something new to try.`,
  },
  {
    q: "Do you keep my searches?",
    topic: "Account",
    a: "No. A check is worked out when you ask and is not saved unless you share it as a link. To keep the service fair we count how many checks each visitor runs in a day, using a scrambled version of the network address.",
  },
  {
    q: "Can I use this data in my own app?",
    topic: "Build",
    a: "Yes. The same lookups are available through a public API, with docs, and as a skill for AI assistants.",
  },
  {
    q: "Is this financial advice?",
    topic: "Results",
    a: "No. A result describes the past and says nothing about what comes next.",
  },
];

export default function LandingPage() {
  const checks = demoChecks();
  const hero = heroChecks();
  const anon = limitsFor("anonymous").day;
  const user = limitsFor("user").day;
  const questions = faqs(anon, user);
  const section = "mx-auto w-full max-w-6xl px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6";
  const h2 = "font-heading text-2xl font-bold tracking-tight sm:text-4xl";

  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SmoothScroll />
      <RevealObserver />
      <SiteHeader />

      <main className="flex-1">
        {/* The hero: one promise, one action, and a real result drawing itself. */}
        <section className={`${section} grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-24`}>
          <div className="flex flex-col gap-6">
            <h1 className="font-heading text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
              <WordRise text="A time machine for your money." />
            </h1>
            <p className="enter-up max-w-xl font-heading text-xl leading-snug text-primary sm:text-2xl" style={{ "--base": "650ms", "--i": 0 } as React.CSSProperties}>
              You can&rsquo;t change the past. You can learn from it.
            </p>
            <SpotlightText
              className="enter-up max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
              style={{ "--base": "650ms", "--i": 1 } as React.CSSProperties}
              text="Pick a stock, a coin or a currency and a date. Replay uses real daily prices to show what one buy, or a monthly habit, would have turned into."
            />
            <div className="enter-up flex flex-wrap items-center gap-x-6 gap-y-3" style={{ "--base": "650ms", "--i": 2 } as React.CSSProperties}>
              <WaitlistButton />
              <a href="#demo" className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">
                Try it first
              </a>
            </div>
            <p className="enter-up max-w-xl text-xs leading-relaxed text-muted-foreground" style={{ "--base": "650ms", "--i": 3 } as React.CSSProperties}>
              Prices from Yahoo Finance, Bitstamp, CoinGecko, Nasdaq, the ECB and the Federal Reserve.
            </p>
          </div>
          {hero.length > 0 && <HeroChart checks={hero} />}
        </section>

        {/* The live demo, on a band that runs the full width of the screen: a dot grid with a sweep of light across it, a mint
            glow in the corner and hairlines top and bottom, so it reads as a place of its own. */}
        <section id="demo" className="relative isolate scroll-mt-20 overflow-hidden border-y border-border py-14 sm:py-24">
          <div aria-hidden className="band-surface pointer-events-none absolute inset-0 -z-10" />
          <div aria-hidden className="band-dots pointer-events-none absolute -z-10" />
          <div aria-hidden className="band-dots-lit pointer-events-none absolute -z-10" />
          <div className={section}>
            <div className="mb-6 flex max-w-2xl flex-col gap-2 sm:mb-8" data-reveal-on-scroll style={later()}>
              <h2 className={h2}>What if you had bought it back then?</h2>
              <SpotlightText className="text-sm leading-relaxed text-muted-foreground sm:text-base" text="Hindsight answers from saved results, so they appear at once. Wayback runs a live lookup, which takes a second or two." />
            </div>
            <div data-reveal-on-scroll style={later(120)}>
              <LandingDemo checks={checks} />
            </div>
          </div>
        </section>

        {/* How it works. */}
        <section className={`${section} py-10 sm:py-16`}>
          <h2 className={`${h2} mb-8 max-w-2xl sm:mb-10`} data-reveal-on-scroll style={later()}>
            Three steps from a question to an answer.
          </h2>
          <ol className="grid gap-x-4 gap-y-9 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-9">
            {[
              { n: "1", t: "Pick what and when", d: "Search a stock or a coin, or choose a currency pair, then a start month. Each result says how far back its data goes." },
              { n: "2", t: "Choose how you buy", d: "One buy at the start, or the same amount every month, quarter or year, on the day of the month you choose." },
              { n: "3", t: "Read what happened", d: "Money in, what it is worth now, a chart of the path, and a table with every month's price and source." },
            ].map((s, i) => (
              <li key={s.n} className="cut-card pulse-hover shadow-hard flex flex-col gap-3 border border-border bg-card p-5 sm:p-6" data-reveal-on-scroll style={later(i * 120)}>
                <StepVisual step={s.n as "1" | "2" | "3"} />
                <span className="font-heading text-3xl font-bold text-primary tabular-nums">{s.n}</span>
                <h3 className="text-lg font-bold">{s.t}</h3>
                <SpotlightText className="text-sm leading-relaxed text-muted-foreground" text={s.d} />
              </li>
            ))}
          </ol>
        </section>

        {/* What is in it. */}
        <section className={`${section} py-10 sm:py-16`}>
          <h2 className={`${h2} mb-8 max-w-2xl sm:mb-10`} data-reveal-on-scroll style={later()}>
            Four ways to look at the past.
          </h2>
          {/* Uneven on purpose: a wide card beside a narrow one, then the other way round. */}
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-6">
            {[
              { Visual: HindsightVisual, t: "Hindsight", d: "What a single buy or a monthly habit would be worth today, for stocks, coins and currencies, with dividends and currency conversion.", href: "/hindsight", cta: "Open Hindsight", span: "lg:col-span-4" },
              { Visual: WaybackVisual, t: "Wayback", d: "The price and market cap of a token or stock at a past moment, to the minute for recent dates.", href: "/wayback", cta: "Open Wayback", span: "lg:col-span-2" },
              { Visual: LeverageVisual, t: "Leverage", d: "The same buys as futures-style positions, long or short, up to 100x, with funding, fees and liquidation.", href: "/hindsight", cta: "Try it in Hindsight", span: "lg:col-span-2" },
              { Visual: ShareVisual, t: "Share and build", d: "Save a result as a link anyone can open, or call the same data from your own code with the public API.", href: "/docs", cta: "Read the docs", span: "lg:col-span-4" },
            ].map(({ Visual, t, d, href, cta, span }, i) => (
              <Link key={t} href={href} className={`cut-card pulse-hover group flex flex-col gap-4 border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 sm:p-5 ${span}`} data-reveal-on-scroll style={later((i % 2) * 120)}>
                <Visual />
                <div className="flex flex-1 flex-col gap-2 px-1 pb-1">
                  <h3 className="text-lg font-bold">{t}</h3>
                  <SpotlightText className="text-sm leading-relaxed text-muted-foreground" text={d} />
                  <span className="mt-auto w-fit pt-2 text-sm underline decoration-border underline-offset-4 transition-colors group-hover:decoration-primary">{cta}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Free now, more with an account. */}
        <section className={`${section} py-10 sm:py-16`}>
          <div className="cut-card pulse-hover grid gap-8 border border-border bg-card p-5 sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12" data-reveal-on-scroll style={later()}>
            <div className="flex flex-col gap-3">
              <h2 className={h2}>Free to try. More when you sign in.</h2>
              <SpotlightText className="text-sm leading-relaxed text-muted-foreground sm:text-base" text="Everything on this page works without an account. Sign in with your email, with no password to remember, and the daily limit goes up. Saved checks and exports are next." />
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
          <h2 className={`${h2} mb-8 max-w-2xl`} data-reveal-on-scroll style={later()}>
            Questions people ask.
          </h2>
          <Faq items={questions} />
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
          <div className="flex flex-col items-start gap-5 border-l-2 border-primary pl-5 sm:pl-8" data-reveal-on-scroll style={later()}>
            <h2 className={`${h2} max-w-2xl`}>Be first when Replay opens up.</h2>
            <SpotlightText className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base" text="Join the waitlist and we will email you when there is something new to try." />
            <WaitlistButton />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
