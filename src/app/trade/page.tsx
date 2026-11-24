import { Bot, FlaskConical, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { NotifyForm } from "@/components/NotifyForm";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SpotlightText } from "@/components/SpotlightText";
import { pageMeta } from "@/lib/site.ts";

const TITLE = "Trade: coming soon";
const DESCRIPTION = "Train an agent on how you really trade, then paper trade and trade live with it. Drop your email to be told when it is ready.";

export const metadata: Metadata = pageMeta({ title: TITLE, fullTitle: `${TITLE} | Replay`, description: DESCRIPTION, path: "/trade" });

/** What is coming, in the order it is meant to be used. None of it can be done today, and the page says so. */
const COMING = [
  { Icon: Bot, title: "Train my agent", text: "Your decisions broken down into data an agent can learn your patterns from, so it can help you stop repeating the same mistakes." },
  { Icon: FlaskConical, title: "Paper trading", text: "Try a strategy, yours or your agent's, with practice money first, and see how it holds up before you spend any real money." },
  { Icon: Wallet, title: "Live trading", text: "Deposit stablecoins and trade yourself or through an agent you give access to." },
];

export default function TradePage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <SiteHeader />

      <main className="stagger-in mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] pb-16 sm:px-6 sm:py-10 sm:pb-24">
        <div className="flex flex-col gap-10 sm:pt-6">
          <div className="flex flex-col gap-5">
            <span className="w-fit border border-primary/50 bg-card/40 px-2 py-0.5 text-xs font-bold text-primary">Coming soon</span>
            <h1 className="font-heading text-4xl font-medium tracking-tight sm:text-6xl">Trade</h1>
            <SpotlightText className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base" text="This feature is coming soon. Drop your email address and we will let you know the moment it is ready." />
            <NotifyForm className="mt-1" />
          </div>

          <section aria-label="What is coming">
            <ul className="grid gap-4 sm:grid-cols-3">
              {COMING.map(({ Icon, title, text }) => (
                // The same card as the "coming next" cards on the landing page: dots fade in under it on hover, the border lights up, and the text has the spotlight.
                <li key={title} className="tex-hover flex flex-col gap-3 border border-border bg-secondary p-5 transition-colors duration-300 hover:border-primary/50">
                  <Icon className="size-7 text-primary" strokeWidth={1.5} aria-hidden />
                  <h2 className="text-lg font-bold">{title}</h2>
                  <SpotlightText className="text-sm leading-relaxed text-muted-foreground" text={text} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
