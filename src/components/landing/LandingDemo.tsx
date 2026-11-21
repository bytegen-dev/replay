"use client";

import Link from "next/link";
import { useState } from "react";
import { DrawChart } from "@/components/landing/DrawChart";
import type { ExampleGroup } from "@/lib/examples.ts";
import type { DemoCheck } from "@/lib/landingData.ts";
import { cn } from "@/lib/utils";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The four kinds of thing Wayback can look at, in the order of its own tabs, each with its own ready-made examples. */
const TABS: { group: ExampleGroup; label: string }[] = [
  { group: "stocks", label: "Stocks" },
  { group: "crypto", label: "Crypto" },
  { group: "currencies", label: "Currencies" },
  { group: "commodities", label: "Commodities" },
];

/** Wayback as a demo: pick a kind of asset, then one of its ready-made examples, and see what the buy would be worth today. */
export function LandingDemo({ checks }: { checks: DemoCheck[] }) {
  const [group, setGroup] = useState<ExampleGroup>(TABS.find((t) => checks.some((c) => c.group === t.group))?.group ?? "stocks");
  // The example picked in each tab is remembered, so going back to a tab finds it as it was left.
  const [picked, setPicked] = useState<Partial<Record<ExampleGroup, string>>>({});
  const inGroup = checks.filter((c) => c.group === group);
  const check = inGroup.find((c) => c.id === picked[group]) ?? inGroup[0];

  const chip = (active: boolean) => cn("h-9 border px-3 text-xs transition-colors sm:text-sm", active ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground");

  return (
    <div className="cut-card pulse-hover flex flex-col gap-5 border border-border bg-card p-4 sm:p-6">
      {/* The tabs sit in a header with a line under it, edge to edge, like the header of the Wayback form. */}
      <div className="-mx-4 border-b border-border px-4 pb-5 sm:-mx-6 sm:px-6">
      <div role="tablist" aria-label="What to look at" className="flex max-w-xl flex-nowrap">
        {TABS.map((t, i) => (
          <button
            key={t.group}
            type="button"
            role="tab"
            aria-selected={group === t.group}
            data-state={group === t.group ? "on" : "off"}
            onClick={() => setGroup(t.group)}
            // One row on every screen: on a phone the tabs are a little smaller and share the row by the length of their words.
            className={cn("form-control-h flex min-w-0 flex-auto items-center justify-center border border-border px-2 text-center text-xs font-bold whitespace-nowrap transition-colors sm:flex-1 sm:px-3 sm:text-sm", i > 0 && "-ml-px", i === 0 && "cut-tab-first", i === TABS.length - 1 && "cut-tab-last", group === t.group ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      </div>

      {check ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pick an example">
            {inGroup.map((c) => (
              <button key={c.id} type="button" aria-pressed={c.id === check.id} onClick={() => setPicked((p) => ({ ...p, [group]: c.id }))} className={chip(c.id === check.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="border-l-2 border-primary pl-4 text-base leading-relaxed sm:text-lg">
            {check.buying} into <b>{check.name}</b>
            {check.leverage && (
              <>
                {" "}
                at <b>{check.leverage.times}x {check.leverage.side}</b>
              </>
            )}{" "}
            {check.timing} put in <b>{usd(check.invested)}</b>. Today that is worth <b>{usd(check.value)}</b>, {check.gainPct >= 0 ? "a gain" : "a loss"} of <b>{Math.abs(check.gainPct).toFixed(1)}%</b>
            {check.leverage && check.leverage.liquidated > 0 && (
              <>
                , with <b>{check.leverage.liquidated}</b> of {check.leverage.positions} {check.leverage.positions === 1 ? "position" : "positions"} closed out when the price moved against {check.leverage.positions === 1 ? "it" : "them"}
              </>
            )}
            .
          </p>
          <DrawChart points={check.points} runKey={check.id} height={280} ariaLabel={`${check.question} ${usd(check.invested)} put in, worth ${usd(check.value)} today.`} />
        </div>
      ) : (
        <p className="min-h-48 border-l-2 border-border pl-4 text-base text-muted-foreground sm:text-lg">Coming soon</p>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href="/wayback" className="underline underline-offset-4 hover:text-foreground">
          Run your own on Wayback
        </Link>
        : any stock, coin, commodity or currency, any month, with leverage if you like. Or{" "}
        <Link href="/wayback?view=price" className="underline underline-offset-4 hover:text-foreground">
          look up the price on a single day
        </Link>
        .
      </p>
    </div>
  );
}
