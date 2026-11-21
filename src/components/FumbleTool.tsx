"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isWalletAddress } from "@/lib/fumble/helius.ts";
import type { ApiResult, ApiTrades } from "@/lib/fumble/service.ts";
import { buildRows, explorerUrl, fumbleCell, makeEventReader, roundTripCell, shortMint, sol, times, usd, type Row, type StreamEvent } from "@/lib/fumble/view.ts";
import { cn } from "@/lib/utils";

type Progress = { stage: "history" | "prices" | "done"; done: number; total: number };

const when = (t: number) => new Date(t * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Paste a wallet, see its trades as soon as they are read, and watch each sell's fumble fill in as the prices come. One request
 * streams everything: progress, then the trades, then the finished scan.
 */
export function FumbleTool({ launch = false, className, intro, aside }: {
  /** Opens the Fumble page with the wallet instead of scanning here, for use on another page. Nothing is scanned or shown in this mode, and the address bar is left alone. */
  launch?: boolean;
  className?: string;
  /** A heading block shown above the field, inside the same column. */
  intro?: React.ReactNode;
  /** Something shown beside the heading and field on wide screens, on their left. */
  aside?: React.ReactNode;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [trades, setTrades] = useState<ApiTrades | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  const scan = useCallback(async (wallet: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus("scanning");
    setError(null);
    setProgress({ stage: "history", done: 0, total: 0 });
    setTrades(null);
    setResult(null);
    window.history.replaceState(null, "", `/fumble?wallet=${wallet}`);

    let finished = false;
    const fail = (message: string) => {
      finished = true;
      setError(message);
      setStatus("error");
    };
    const reader = makeEventReader((e: StreamEvent) => {
      if (e.type === "progress") setProgress({ stage: e.stage, done: e.done, total: e.total });
      else if (e.type === "trades") setTrades(e.data);
      else if (e.type === "result") {
        finished = true;
        setTrades(e.data);
        setResult(e.data);
        setStatus("done");
      } else if (e.type === "error") fail(e.message);
    });

    try {
      const res = await fetch("/api/fumble/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }), signal: ctl.signal });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        return fail(j?.error ?? "The scan could not start. Try again shortly.");
      }
      const stream = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value: chunk } = await stream.read();
        if (done) break;
        reader.push(decoder.decode(chunk, { stream: true }));
      }
      reader.push(decoder.decode());
      reader.end();
      if (!finished) fail("The scan stopped early. Try again.");
    } catch (e) {
      if (ctl.signal.aborted) return;
      fail(e instanceof Error && e.name !== "TypeError" ? e.message : "Could not reach the scanner. Check your connection and try again.");
    }
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const wallet = value.trim();
    if (!isWalletAddress(wallet)) {
      setError("That doesn't look like a Solana wallet address.");
      setStatus("error");
      return;
    }
    if (launch) {
      setError(null);
      setStatus("scanning"); // the button shows it is working until the Fumble page opens
      router.push(`/fumble?wallet=${wallet}`);
      return;
    }
    void scan(wallet);
  }

  // A link with ?wallet= opens straight into that wallet's scan.
  useEffect(() => {
    if (launch) return;
    const id = setTimeout(() => {
      const w = new URLSearchParams(window.location.search).get("wallet")?.trim() ?? "";
      if (isWalletAddress(w)) {
        setValue(w);
        void scan(w);
      }
    }, 0);
    return () => {
      clearTimeout(id);
      abort.current?.abort();
    };
  }, [scan, launch]);

  const scanning = status === "scanning";
  const rows = trades ? buildRows(trades.trades, result?.sells ?? null, result?.positions ?? null) : [];

  return (
    <div className={cn("flex flex-col gap-6", className ?? "mt-6")}>
      <div className={cn(aside && "cut-card pulse-hover grid items-center gap-8 border border-border bg-card p-5 sm:p-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12")}>
        <div className="flex flex-col gap-6">
          {intro}
              <form onSubmit={submit} noValidate className="max-w-2xl">
                <Label htmlFor="fumble-wallet" className="sr-only">
                  Solana wallet address
                </Label>
                <div className="flex">
                  {/* The box and the button meet with no gap, like the waitlist form: the box has its bottom-left corner cut, the button its top-right. */}
                  <div className="cut-bl h-11 min-w-0 flex-1 sm:h-12">
                    <Input
                      id="fumble-wallet"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="Solana wallet address"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-invalid={status === "error" && !trades}
                      className="h-full w-full rounded-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <Button type="submit" disabled={scanning} className="cut-tr cut-primary h-11 shrink-0 gap-2 rounded-none border-0 px-5 text-sm font-bold text-primary-foreground sm:h-12 sm:px-7 sm:text-base">
                    {scanning && <MarkLoader className="size-4" />}
                    {scanning ? "Scanning" : "Scan"}
                  </Button>
                </div>
                {error && (
                  <p role="alert" className="mt-2 text-sm font-bold">
                    {error}
                  </p>
                )}
              </form>

              {scanning && !launch && <ProgressLine progress={progress} hasTrades={!!trades} />}
        </div>
        {aside && <div className="hidden lg:order-first lg:block">{aside}</div>}
      </div>

      {trades && (
        <>
          <Summary trades={trades} result={result} />
          <TradeTable rows={rows} done={status === "done"} />
        </>
      )}
    </div>
  );
}

function ProgressLine({ progress, hasTrades }: { progress: Progress | null; hasTrades: boolean }) {
  const prices = progress?.stage === "prices" && progress.total > 0;
  const label = !hasTrades ? "Reading trades" : prices ? `Pricing coins, ${Math.min(progress!.done + 1, progress!.total)} of ${progress!.total}` : "Pricing coins";
  const pct = prices ? Math.round((progress!.done / progress!.total) * 100) : null;
  return (
    <div role="status" aria-live="polite" className="max-w-2xl">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 h-0.5 w-full overflow-hidden bg-border">
        <div className={cn("h-full bg-primary transition-[width] duration-500", pct === null && "w-1/3 animate-pulse")} style={pct === null ? undefined : { width: `${Math.max(pct, 4)}%` }} />
      </div>
    </div>
  );
}

function Summary({ trades, result }: { trades: ApiTrades; result: ApiResult | null }) {
  const unknown = result?.unknown ?? 0;
  const unknownPositions = result ? result.positions.filter((p) => p.status === "unknown").length : 0;
  const sells = trades.trades.filter((t) => t.side === "sell").length;
  const cov = trades.coverage;
  const big = "font-heading text-4xl font-bold tabular-nums sm:text-5xl";
  return (
    <section aria-label="Summary" className="cut-card pulse-hover border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="flex flex-wrap gap-x-12 gap-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Fumbled</p>
            {result ? <p className={big}>{usd(result.totalFumbleUsd)}</p> : <p className={cn(big, "text-muted-foreground")}>&hellip;</p>}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Gave back</p>
            {result ? <p className={big}>{result.positions.length ? sol(result.totalRoundTripSol) : "\u2014"}</p> : <p className={cn(big, "text-muted-foreground")}>&hellip;</p>}
          </div>
        </div>
        <dl className="flex gap-8 text-sm">
          <div>
            <dt className="text-muted-foreground">Trades</dt>
            <dd className="font-bold tabular-nums">{trades.trades.length}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sells</dt>
            <dd className="font-bold tabular-nums">{sells}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-4 flex max-w-2xl flex-col gap-1 text-sm leading-relaxed text-muted-foreground">
        <p>Fumbled: what the coins sold would be worth at their highest price since the sale, minus what they sold for.</p>
        <p>Gave back: the most profit a coin showed while it was held, minus the profit kept.</p>
      </div>
      {(unknown > 0 || unknownPositions > 0 || !cov.complete || result?.ranOutOfTime) && (
        <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
          {!cov.complete && cov.oldest && <li>Trades since {when(cov.oldest)}. Older ones weren&rsquo;t read.</li>}
          {unknown > 0 && <li>{unknown === 1 ? "1 sell has" : `${unknown} sells have`} no price history, so {unknown === 1 ? "it isn't" : "they aren't"} counted.</li>}
          {unknownPositions > 0 && <li>{unknownPositions === 1 ? "1 position has" : `${unknownPositions} positions have`} no price history, so {unknownPositions === 1 ? "its" : "their"} round-trip isn&rsquo;t counted.</li>}
          {result?.ranOutOfTime && <li>The scan ran out of time before pricing every coin.</li>}
        </ul>
      )}
    </section>
  );
}

function TradeTable({ rows, done }: { rows: Row[]; done: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No token trades of 0.1 SOL or more in the part of the history that was read.</p>;
  return (
    <section aria-label="Trades">
      <div role="row" className="hidden grid-cols-[10rem_minmax(0,1fr)_7rem_12rem_10rem] gap-x-4 border-b border-border px-3 pb-2 text-sm text-muted-foreground sm:grid">
        <span>When</span>
        <span>Coin</span>
        <span className="text-right">Size</span>
        <span className="text-right">Fumble</span>
        <span className="text-right">Gave back</span>
      </div>
      <ul>
        {rows.map((r) => (
          <TradeRow key={r.trade.signature} row={r} done={done} />
        ))}
      </ul>
    </section>
  );
}

function TradeRow({ row, done }: { row: Row; done: boolean }) {
  const { trade } = row;
  const cell = fumbleCell(row, done);
  const trip = roundTripCell(row);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-border/60 px-3 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_7rem_12rem_10rem] sm:items-center">
      <span className="flex min-w-0 items-center gap-2 sm:order-2">
        <span className={cn("inline-flex h-5 w-10 shrink-0 items-center justify-center border text-xs font-bold", trade.side === "buy" ? "border-primary text-primary" : "border-foreground/40 text-foreground")}>{trade.side === "buy" ? "Buy" : "Sell"}</span>
        <a href={explorerUrl(trade.token)} target="_blank" rel="noreferrer" className="truncate font-bold underline-offset-4 hover:text-primary hover:underline" title={trade.token}>
          {shortMint(trade.token)}
        </a>
      </span>
      <span className="text-right sm:order-4">
        {cell.kind === "none" && <span className="text-muted-foreground">&mdash;</span>}
        {cell.kind === "pricing" && <span className="animate-pulse text-muted-foreground">Pricing</span>}
        {cell.kind === "sold-well" && <span className="text-muted-foreground">No fumble</span>}
        {cell.kind === "unknown" && (
          <span className="text-muted-foreground" title={cell.reason}>
            No price data
          </span>
        )}
        {cell.kind === "fumbled" && (
          <>
            <span className="font-bold tabular-nums text-destructive">{usd(cell.usd)}</span>
            <span className="ml-2 text-xs text-muted-foreground">{times(cell.peakMultiple)} after</span>
          </>
        )}
      </span>
      <span className="text-muted-foreground sm:order-1">{when(trade.time)}</span>
      <span className="text-right tabular-nums sm:order-3">{trade.sol.toFixed(2)} SOL</span>
      {trip.kind !== "none" && (
        <span className="col-span-2 text-right sm:order-5 sm:col-span-1">
          {trip.kind === "kept" && <span className="text-muted-foreground">Sold near the peak</span>}
          {trip.kind === "unknown" && (
            <span className="text-muted-foreground" title={trip.reason}>
              No price data
            </span>
          )}
          {trip.kind === "gave-back" && (
            <>
              <span className="font-bold tabular-nums text-destructive">{sol(trip.sol)}</span>
              <span className="ml-2 text-xs text-muted-foreground">{Math.round(trip.share * 100)}% of its profit</span>
            </>
          )}
        </span>
      )}
    </li>
  );
}
