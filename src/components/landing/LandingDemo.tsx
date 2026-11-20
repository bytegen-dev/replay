"use client";

import Link from "next/link";
import { useState } from "react";
import { DrawChart } from "@/components/landing/DrawChart";
import { MarkLoader } from "@/components/MarkLoader";
import { LineChart, UP, DOWN } from "@/components/LineChart";
import { moneyShort } from "@/lib/charts.ts";
import { fmtBig } from "@/lib/format.ts";
import type { HistoricalPriceResult } from "@/lib/historicalPrice.ts";
import type { DemoCheck } from "@/lib/landingData.ts";
import { formatUsdPrice } from "@/lib/priceAt.ts";
import { cn } from "@/lib/utils";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Wayback questions with a fixed date, so the demo gives the same answer every time. Each one is a real lookup. */
const LOOKUPS = [
  { id: "aapl", label: "Apple, 14 Mar 2025", market: "STOCK", asset: "AAPL", date: "14/03/2025" },
  { id: "nvda", label: "NVIDIA, 3 Jan 2023", market: "STOCK", asset: "NVDA", date: "03/01/2023" },
  { id: "pepe", label: "PEPE, 15 Mar 2026", market: "ETH", asset: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", date: "15/03/2026" },
  { id: "sol", label: "SOL, 3 days ago, 09:00", market: "SOL", asset: "So11111111111111111111111111111111111111112", date: "3 days ago", time: "09:00" },
] as const;

type Tool = "hindsight" | "wayback";

/** The two tools as a live demo: Hindsight on saved results (instant), Wayback on a real lookup (a second or two). */
export function LandingDemo({ checks }: { checks: DemoCheck[] }) {
  const [tool, setTool] = useState<Tool>("hindsight");
  const [pick, setPick] = useState(checks[0]?.id ?? "");
  const [lookup, setLookup] = useState<string | null>(null);
  const [result, setResult] = useState<HistoricalPriceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = checks.find((c) => c.id === pick) ?? checks[0];

  async function runLookup(id: string) {
    const l = LOOKUPS.find((x) => x.id === id);
    if (!l) return;
    setLookup(id);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/historical-price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ market: l.market, asset: l.asset, date: l.date, ...("time" in l ? { time: l.time } : {}), tz: "UTC" }),
      });
      const j = (await res.json().catch(() => null)) as (HistoricalPriceResult & { error?: string }) | null;
      if (!res.ok || !j || !("price" in j)) throw new Error(j?.error ?? "That lookup didn't work. Try another.");
      setResult(j);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "That lookup didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const tab = (t: Tool, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tool === t}
      onClick={() => {
        setTool(t);
        if (t === "wayback" && !lookup) void runLookup(LOOKUPS[0].id);
      }}
      className={cn("form-control-h flex-1 border border-border px-3 text-sm font-bold transition-colors", tool === t ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </button>
  );

  const chip = (active: boolean) => cn("h-9 border px-3 text-xs transition-colors sm:text-sm", active ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground");

  return (
    <div className="cut-card pulse-hover flex flex-col gap-5 border border-border bg-card p-4 sm:p-6">
      <div role="tablist" aria-label="Pick a tool" className="flex max-w-md gap-0">
        {tab("hindsight", "Hindsight")}
        {tab("wayback", "Wayback")}
      </div>

      {tool === "hindsight" && check && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pick a check">
            {checks.map((c) => (
              <button key={c.id} type="button" aria-pressed={c.id === check.id} onClick={() => setPick(c.id)} className={chip(c.id === check.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="border-l-2 border-primary pl-4 text-base leading-relaxed sm:text-lg">
            {check.buying} into <b>{check.name}</b> {check.timing} put in <b>{usd(check.invested)}</b>. Today that is worth <b>{usd(check.value)}</b>, {check.gainPct >= 0 ? "a gain" : "a loss"} of <b>{Math.abs(check.gainPct).toFixed(1)}%</b>.
          </p>
          <DrawChart points={check.points} runKey={check.id} height={280} ariaLabel={`${check.question} ${usd(check.invested)} put in, worth ${usd(check.value)} today.`} />
          <p className="text-sm text-muted-foreground">
            Saved results show instantly.{" "}
            <Link href="/hindsight" className="underline underline-offset-4 hover:text-foreground">
              Run your own on the Hindsight page
            </Link>
            : any stock, coin or currency, any month, with leverage if you like.
          </p>
        </div>
      )}

      {tool === "wayback" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pick a lookup">
            {LOOKUPS.map((l) => (
              <button key={l.id} type="button" aria-pressed={lookup === l.id} onClick={() => void runLookup(l.id)} className={chip(lookup === l.id)}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="min-h-[22rem]" aria-live="polite">
            {busy && (
              <p className="flex items-center gap-3 text-sm text-muted-foreground">
                <MarkLoader className="size-5" /> Looking it up
              </p>
            )}
            {!busy && error && (
              <p role="alert" className="text-sm font-bold">
                {error}
              </p>
            )}
            {!busy && !error && result && <WaybackResult r={result} />}
          </div>
          <p className="text-sm text-muted-foreground">
            This is a live lookup.{" "}
            <Link href="/wayback" className="underline underline-offset-4 hover:text-foreground">
              Ask your own on the Wayback page
            </Link>
            : any token or stock, to the minute for recent dates.
          </p>
        </div>
      )}
    </div>
  );
}

function WaybackResult({ r }: { r: HistoricalPriceResult }) {
  const up = !r.current || r.current.changePercent >= 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 border-l-2 border-primary pl-4">
        <p className="text-sm text-muted-foreground">
          {r.asset.name ?? r.asset.symbol} · {r.when.description}
        </p>
        <p className="font-heading text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{formatUsdPrice(r.price.usd)}</p>
        {r.marketCap && (
          <p className="text-base" title={r.marketCap.note}>
            <span className="text-muted-foreground">Market cap </span>
            <b className="tabular-nums">{fmtBig(r.marketCap.usd)}</b>
            {r.marketCap.basis === "estimated" && <span className="text-muted-foreground"> (estimated)</span>}
          </p>
        )}
        {r.current && (
          <p className="text-sm text-muted-foreground">
            now {formatUsdPrice(r.current.usd)}, <span className={up ? "text-primary" : "text-destructive"}>{r.current.changePercent >= 0 ? "+" : ""}{r.current.changePercent.toLocaleString("en-US")}%</span> since
          </p>
        )}
      </div>
      {r.series.length >= 3 && (
        <LineChart
          series={[{ key: "price", label: "Price", area: true, color: up ? UP : DOWN, points: r.series.map((p) => ({ x: p.t * 1000, y: p.usd })) }]}
          yFormat={(n) => (n >= 1 ? moneyShort(n) : formatUsdPrice(n))}
          zeroBaseline={false}
          marker={{ x: Date.parse(r.when.instantUtc), label: formatUsdPrice(r.price.usd) }}
          height={220}
          ariaLabel={`Price around ${r.when.description}`}
        />
      )}
    </div>
  );
}
