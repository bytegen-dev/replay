"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { DotsToggle, useDotsPref } from "@/components/DotsToggle";
import { VideoButton } from "@/components/VideoButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { DOWN, LineChart, UP, type ChartSeries } from "@/components/LineChart";
import { growthSeries, moneyShort } from "@/lib/charts.ts";
import { fmtPrice, fmtUsd } from "@/lib/format.ts";
import type { LeverageSeriesPoint } from "@/lib/leverage.ts";
import type { BuyRow } from "@/lib/math.ts";
import { formatUsdPrice } from "@/lib/priceAt.ts";
import { cn } from "@/lib/utils";

type View = "growth" | "price";
/** Timeframe buttons, in years. "All" is always there; the others only when the data spans more than that. */
const FRAMES = [1, 3, 5] as const;
const YEAR_MS = 365.25 * 86_400_000;

/** The backtest as a picture: what you put in against what it was worth, and the price against your average cost. */
export function GrowthChart({ buys, priceToday, priceTodayDate, unit, title = "Replay", leverage }: { buys: BuyRow[]; priceToday: number | null; priceTodayDate: string | null; unit: "shares" | "tokens"; title?: string; leverage?: { times: number; side?: "long" | "short"; series: LeverageSeriesPoint[] } }) {
  const [viewPick, setView] = useState<View>("growth");
  // A leveraged run only has the growth picture: there is no single average cost to compare the price with.
  const view: View = leverage ? "growth" : viewPick;
  const [frame, setFrame] = useState<number | "all">("all");
  // Replay: how far along the history the line has been drawn, in points and fractions of a point (null shows it all), whether it is running, and how fast.
  const [step, setStep] = useState<number | null>(null);
  const stepRef = useRef<number | null>(null);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [dots, setDots] = useDotsPref();
  const allPoints = useMemo(
    () => (leverage ? leverage.series.map((p) => ({ t: Date.parse(`${p.date}T00:00:00Z`), date: p.date, invested: p.invested, value: p.value, price: p.price, avgCost: 0 })) : growthSeries(buys, priceToday, priceTodayDate)),
    [buys, priceToday, priceTodayDate, leverage],
  );
  const spanYears = allPoints.length > 1 ? (allPoints[allPoints.length - 1].t - allPoints[0].t) / YEAR_MS : 0;
  const frames = FRAMES.filter((y) => spanYears > y + 0.1);
  // A timeframe that no longer fits (new result, shorter span) falls back to everything.
  const activeFrame = frame !== "all" && frames.includes(frame as (typeof FRAMES)[number]) ? frame : "all";
  const points = useMemo(() => {
    if (activeFrame === "all" || allPoints.length < 2) return allPoints;
    const from = allPoints[allPoints.length - 1].t - activeFrame * YEAR_MS;
    const cut = allPoints.filter((p) => p.t >= from);
    return cut.length >= 2 ? cut : allPoints;
  }, [allPoints, activeFrame]);
  const total = points.length;
  const progress = step === null ? total : Math.min(Math.max(step, 2), total);
  const shownCount = Math.floor(progress);
  const frac = progress - shownCount;
  const replaying = step !== null && progress < total;
  // The points drawn so far, plus a tip that slides from the last one toward the next, so the line grows smoothly.
  const shown = useMemo(() => {
    if (progress >= total) return points;
    const done = points.slice(0, shownCount);
    if (frac < 0.001 || shownCount >= total) return done;
    const a = points[shownCount - 1];
    const b = points[shownCount];
    const mix = (x: number, y: number) => x + (y - x) * frac;
    return [...done, { ...b, t: mix(a.t, b.t), value: mix(a.value, b.value), invested: mix(a.invested, b.invested), price: mix(a.price, b.price), avgCost: mix(a.avgCost, b.avgCost) }];
  }, [points, progress, shownCount, frac, total]);
  // The axes stay at the full history's size while the replay draws into them.
  const fixedRange = useMemo(() => {
    if (!replaying) return undefined;
    const ys = points.flatMap((p) => (view === "growth" ? [p.value, p.invested] : [p.price, p.avgCost]));
    return { xMin: points[0].t, xMax: points[total - 1].t, yMin: Math.min(...ys), yMax: Math.max(...ys) };
  }, [replaying, points, view, total]);

  // Drawn every frame: 1x is about two months a second, and the line moves between them rather than jumping.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = (stepRef.current ?? 2) + ((now - last) / 1000) * speed * 1.9;
      last = now;
      if (next >= total) {
        stepRef.current = null;
        setStep(null);
        setPlaying(false);
        return;
      }
      stepRef.current = next;
      setStep(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total]);

  const stopReplay = () => {
    setPlaying(false);
    setStep(null);
  };
  // The readout names the last whole month reached, not the sliding tip.
  const lastPoint = progress >= total ? points[total - 1] : points[Math.max(shownCount - 1, 0)];
  const upGrowth = !lastPoint || lastPoint.value >= lastPoint.invested;
  const upPrice = !lastPoint || lastPoint.price >= lastPoint.avgCost;
  const series = useMemo<ChartSeries[]>(
    () =>
      view === "growth"
        ? [
            { key: "value", label: "Worth at the time", area: true, dots, color: upGrowth ? UP : DOWN, points: shown.map((p) => ({ x: p.t, y: p.value })) },
            { key: "invested", label: "Total invested", dashed: true, points: shown.map((p) => ({ x: p.t, y: p.invested })) },
          ]
        : [
            { key: "price", label: "Price", dots, color: upPrice ? UP : DOWN, points: shown.map((p) => ({ x: p.t, y: p.price })) },
            { key: "avg", label: "Your average cost", dashed: true, points: shown.map((p) => ({ x: p.t, y: p.avgCost })) },
          ],
    [view, shown, upGrowth, upPrice, dots],
  );

  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <section className="flex flex-col gap-4 border border-border bg-card p-4 sm:p-6" aria-label="Charts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold">{leverage ? `How it grew with ${leverage.times}x ${leverage.side === "short" ? "short" : "leverage"}` : view === "growth" ? "How it grew" : "Price against your average cost"}</h3>
        <div role="group" aria-label="Chart" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {/* Timeframe, like a trading terminal: small pills, the active one lit. */}
          <div role="group" aria-label="Timeframe" className="flex gap-1">
            {([...frames, "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={activeFrame === f}
                onClick={() => {
                  setFrame(f);
                  stopReplay();
                }}
                className={cn("h-7 min-w-9 px-2 text-xs font-bold", activeFrame === f ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}
              >
                {f === "all" ? "All" : `${f}Y`}
              </button>
            ))}
            <DotsToggle on={dots} onChange={setDots} className="ml-1" />
          </div>
          {!leverage &&
            (
              [
                ["growth", "Growth"],
                ["price", "Price vs your cost"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  stopReplay();
                }}
                className={cn("underline-offset-4", view === v ? "font-bold underline decoration-2" : "text-muted-foreground hover:text-foreground hover:underline")}
              >
                {label}
              </button>
            ))}
        </div>
      </div>

      <LineChart
        series={series}
        fixedRange={fixedRange}
        yFormat={view === "growth" ? moneyShort : (n) => (n >= 1 ? moneyShort(n) : formatUsdPrice(n))}
        ariaLabel={
          view === "growth"
            ? `Line chart from ${first.date} to ${last.date}. Total invested rose to ${fmtUsd(last.invested)}. The holding was worth ${fmtUsd(last.value)} at the end.`
            : `Line chart from ${first.date} to ${last.date}. The price ended at ${formatUsdPrice(last.price)}, against an average cost of ${formatUsdPrice(last.avgCost)} per ${unit === "shares" ? "share" : "token"}.`
        }
      />

      {/* Replay: watch the buys land one month at a time. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => {
            if (playing) setPlaying(false);
            else {
              if (step === null || step >= total) setStep(2);
              setPlaying(true);
            }
          }}
          className="flex h-9 items-center gap-2 border-2 border-primary px-3 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          aria-label={playing ? "Pause the replay" : step === null ? "Play the replay" : "Resume the replay"}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {playing ? "Pause" : step === null ? "Replay" : "Resume"}
        </button>
        <input
          type="range"
          min={2}
          max={total}
          value={shownCount}
          onChange={(e) => {
            setPlaying(false);
            const v = Number(e.target.value);
            setStep(v >= total ? null : v);
          }}
          aria-label="Scrub through the months"
          aria-valuetext={`${lastPoint.date}`}
          className="h-2 min-w-40 flex-1 cursor-pointer accent-primary"
        />
        <div role="group" aria-label="Replay speed" className="flex gap-1">
          {([1, 2, 4] as const).map((v) => (
            <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)} className={cn("h-7 min-w-9 px-2 text-xs font-bold", speed === v ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}>
              {v}x
            </button>
          ))}
        </div>
        <VideoButton points={points} view={view} title={title} onStart={() => setPlaying(false)} />
        {step !== null && (
          <button type="button" onClick={stopReplay} className="flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" aria-label="Show the whole history again">
            <RotateCcw className="size-3.5" aria-hidden />
            Show all
          </button>
        )}
        {/* Where the replay is: the month, what went in, and what it was worth then. */}
        <p aria-live="off" className="w-full text-sm tabular-nums text-muted-foreground">
          {lastPoint.date} · put in <b className="text-foreground">{fmtUsd(lastPoint.invested)}</b> · worth <b className="text-foreground">{fmtUsd(lastPoint.value)}</b>{" "}
          <span className={lastPoint.value >= lastPoint.invested ? "text-primary" : "text-destructive"}>({lastPoint.invested > 0 ? `${lastPoint.value >= lastPoint.invested ? "+" : ""}${(((lastPoint.value - lastPoint.invested) / lastPoint.invested) * 100).toFixed(1)}%` : "n/a"})</span>
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        {leverage ? (
          <>
            The solid line is what all the leveraged positions were worth each day, with funding and fees taken out, so it swings harder than the plain line. A liquidated position drops out at zero. It ends at <b className="text-foreground">{fmtUsd(last.value)}</b> against <b className="text-foreground">{fmtUsd(last.invested)}</b> put in.
          </>
        ) : view === "growth" ? (
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
