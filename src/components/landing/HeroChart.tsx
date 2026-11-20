"use client";

import { DrawChart } from "@/components/landing/DrawChart";
import { RollText } from "@/components/RollText";
import type { DemoCheck } from "@/lib/landingData.ts";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The hero's picture: one real saved result, with the worth rolling in and the line drawing itself. */
export function HeroChart({ check }: { check: DemoCheck }) {
  return (
    <figure className="cut-card flex flex-col gap-4 border border-border bg-card p-4 sm:p-6" aria-label="Example result">
      <figcaption className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">
          {check.buying} into {check.name} since {check.since}
        </span>
        <span className="font-heading text-4xl font-bold tabular-nums tracking-tight text-primary sm:text-5xl">
          <RollText text={usd(check.value)} introDelay={500} />
        </span>
        <span className="text-sm text-muted-foreground">
          worth today, from <b className="text-foreground">{usd(check.invested)}</b> put in ({check.gainPct >= 0 ? "+" : ""}
          {check.gainPct.toFixed(0)}%)
        </span>
      </figcaption>
      <DrawChart points={check.points} runKey={check.id} height={250} ariaLabel={`${check.buying} into ${check.name} since ${check.since}: ${usd(check.invested)} put in, worth ${usd(check.value)} today.`} />
      <p className="text-xs text-muted-foreground">A saved result from {day(check.asOf)}. The demo below runs more.</p>
    </figure>
  );
}
