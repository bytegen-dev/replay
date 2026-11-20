"use client";

import { useState } from "react";
import { DrawChart } from "@/components/landing/DrawChart";
import { RollText } from "@/components/RollText";
import type { DemoCheck } from "@/lib/landingData.ts";
import { cn } from "@/lib/utils";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The hero's picture: real saved results, one at a time. The light that circles the card's border turns the card to the next
 * check each time it completes a lap, so the card keeps changing without anyone touching it. The five include two that lost money.
 * With reduced motion there is no pulse and no lap, so the card stays on the first one; the dots still let you pick.
 */
export function HeroChart({ checks }: { checks: DemoCheck[] }) {
  const [index, setIndex] = useState(0);
  const check = checks[index % checks.length];
  const up = check.gainPct >= 0;

  return (
    <figure
      className="cut-card pulse-ring flex flex-col gap-4 border border-border bg-card p-4 sm:p-6"
      aria-label="Example results"
      // The light on the border takes the colour of the result: mint for a gain, red for a loss.
      style={{ "--pulse": up ? "var(--primary)" : "var(--destructive)" } as React.CSSProperties}
      // The pulse is a CSS animation on the card's edge; every time it comes round, move on to the next check.
      onAnimationIteration={(e) => {
        if (e.animationName === "ring-turn" && e.target === e.currentTarget) setIndex((i) => (i + 1) % checks.length);
      }}
    >
      <figcaption className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">
          {check.buying} into {check.name} {check.timing}
        </span>
        <span className={cn("font-heading text-4xl font-bold tabular-nums tracking-tight sm:text-5xl", up ? "text-primary" : "text-destructive")}>
          <RollText text={usd(check.value)} />
        </span>
        <span className="text-sm text-muted-foreground">
          worth today, from <b className="text-foreground">{usd(check.invested)}</b> put in{" "}
          <span className={up ? "text-primary" : "text-destructive"}>
            ({up ? "+" : "-"}
            {Math.abs(check.gainPct).toFixed(0)}%)
          </span>
        </span>
      </figcaption>
      <DrawChart points={check.points} runKey={check.id} height={250} ariaLabel={`${check.buying} into ${check.name} ${check.timing}: ${usd(check.invested)} put in, worth ${usd(check.value)} today.`} />
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">Last updated {monthYear(check.asOf)}</p>
        <div role="group" aria-label="Pick an example" className="flex shrink-0 gap-1.5">
          {checks.map((c, i) => (
            <button key={c.id} type="button" aria-label={c.label} aria-pressed={i === index % checks.length} onClick={() => setIndex(i)} className={cn("h-2 transition-all duration-300", i === index % checks.length ? "w-6 bg-primary" : "w-2 bg-border hover:bg-muted-foreground")} />
          ))}
        </div>
      </div>
    </figure>
  );
}
