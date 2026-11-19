"use client";

import { useMemo, useState } from "react";
import { LineChart, type ChartSeries } from "@/components/LineChart";
import { growthSeries, moneyShort } from "@/lib/charts.ts";
import { fmtPrice, fmtUsd } from "@/lib/format.ts";
import type { BuyRow } from "@/lib/math.ts";
import { formatUsdPrice } from "@/lib/priceAt.ts";
import { cn } from "@/lib/utils";

type View = "growth" | "price";

/** The backtest as a picture: what you put in against what it was worth, and the price against your average cost. */
export function GrowthChart({ buys, priceToday, priceTodayDate, unit }: { buys: BuyRow[]; priceToday: number | null; priceTodayDate: string | null; unit: "shares" | "tokens" }) {
  const [view, setView] = useState<View>("growth");
  const points = useMemo(() => growthSeries(buys, priceToday, priceTodayDate), [buys, priceToday, priceTodayDate]);
  const series = useMemo<ChartSeries[]>(
    () =>
      view === "growth"
        ? [
            { key: "value", label: "Worth at the time", area: true, points: points.map((p) => ({ x: p.t, y: p.value })) },
            { key: "invested", label: "Total invested", dashed: true, points: points.map((p) => ({ x: p.t, y: p.invested })) },
          ]
        : [
            { key: "price", label: "Price", points: points.map((p) => ({ x: p.t, y: p.price })) },
            { key: "avg", label: "Your average cost", dashed: true, points: points.map((p) => ({ x: p.t, y: p.avgCost })) },
          ],
    [view, points],
  );

  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <section className="flex flex-col gap-4 border border-border bg-card p-4 sm:p-6" aria-label="Charts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold">{view === "growth" ? "How it grew" : "Price against your average cost"}</h3>
        <div role="group" aria-label="Chart" className="flex border border-border">
          {(
            [
              ["growth", "Growth"],
              ["price", "Price vs your cost"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("h-8 px-3 text-xs sm:text-sm", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <LineChart
        series={series}
        yFormat={view === "growth" ? moneyShort : (n) => (n >= 1 ? moneyShort(n) : formatUsdPrice(n))}
        ariaLabel={
          view === "growth"
            ? `Line chart from ${first.date} to ${last.date}. Total invested rose to ${fmtUsd(last.invested)}. The holding was worth ${fmtUsd(last.value)} at the end.`
            : `Line chart from ${first.date} to ${last.date}. The price ended at ${formatUsdPrice(last.price)}, against an average cost of ${formatUsdPrice(last.avgCost)} per ${unit === "shares" ? "share" : "token"}.`
        }
      />

      <p className="text-sm text-muted-foreground">
        {view === "growth" ? (
          <>
            Each purchase adds to the dashed line. The solid line is what everything held so far was worth on that day, so it dips and climbs with the market. It ends at <b className="text-foreground">{fmtUsd(last.value)}</b> against <b className="text-foreground">{fmtUsd(last.invested)}</b> put in.
          </>
        ) : (
          <>
            Buying the same dollar amount each month means more {unit} when the price is low, so your average cost (dashed) sits below the plain average of prices. It ends at <b className="text-foreground">{fmtPrice(last.avgCost)}</b> per {unit === "shares" ? "share" : "token"}, against a price of <b className="text-foreground">{fmtPrice(last.price)}</b>.
          </>
        )}
      </p>
    </section>
  );
}
