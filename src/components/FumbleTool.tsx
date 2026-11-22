"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWalletAddress } from "@/lib/fumble/helius.ts";
import type { ApiResult, ApiTrades } from "@/lib/fumble/service.ts";
import { downloadFile } from "@/lib/download.ts";
import { buildRows, explorerUrl, fumbleCell, makeEventReader, pnlCell, roundTripCell, signedSol, signedUsd, sol, times, tokenLabel, usd, veryActive, fumbleFileName, type FumbleCell, type PnlCell, type Row, type RoundTripCell, type StreamEvent } from "@/lib/fumble/view.ts";
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
  // Set once the history read so far shows a wallet that does hundreds of transactions a day; it stays set for the rest of the scan.
  const [active, setActive] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const scan = useCallback(async (wallet: string, more = false) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus("scanning");
    setError(null);
    setProgress({ stage: "history", done: 0, total: 0 });
    setTrades(null);
    setResult(null);
    setActive(false);
    window.history.replaceState(null, "", `/fumble?wallet=${wallet}`);

    let finished = false;
    const fail = (message: string) => {
      finished = true;
      setError(message);
      setStatus("error");
    };
    const reader = makeEventReader((e: StreamEvent) => {
      if (e.type === "progress") setProgress({ stage: e.stage, done: e.done, total: e.total });
      else if (e.type === "trades") {
        setTrades(e.data);
        if (veryActive(e.data.coverage, Math.floor(Date.now() / 1000))) setActive(true);
      }
      else if (e.type === "result") {
        finished = true;
        setTrades(e.data);
        setResult(e.data);
        setStatus("done");
      } else if (e.type === "error") fail(e.message);
    });

    try {
      const res = await fetch("/api/fumble/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, ...(more ? { more: true } : {}) }), signal: ctl.signal });
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

              {scanning && !launch && <ProgressLine progress={progress} hasTrades={!!trades} reading={trades?.partial ?? true} active={active} />}
        </div>
        {aside && <div className="hidden lg:order-first lg:block">{aside}</div>}
      </div>

      {trades && (
        <>
          <Summary trades={trades} result={result} onMore={() => void scan(trades.wallet, true)} />
          <TradeTable rows={rows} tokens={trades.tokens} pnl={trades.pnl} done={status === "done"} />
        </>
      )}
    </div>
  );
}

function ProgressLine({ progress, hasTrades, reading, active }: { progress: Progress | null; hasTrades: boolean; reading: boolean; active: boolean }) {
  const prices = progress?.stage === "prices" && progress.total > 0;
  const read = progress?.stage === "history" && progress.done > 0 ? ` (${progress.done.toLocaleString("en-US")} transactions read)` : "";
  const label = reading ? `${hasTrades ? "Reading older trades" : "Reading trades"}${read}` : prices ? `Pricing coins, ${Math.min(progress!.done + 1, progress!.total)} of ${progress!.total}` : "Pricing coins";
  const pct = !reading && prices ? Math.round((progress!.done / progress!.total) * 100) : null;
  return (
    <div role="status" aria-live="polite" className="max-w-2xl">
      <p className="text-sm text-muted-foreground">{label}</p>
      {active && <p className="mt-1 text-sm text-foreground">This wallet is very active, so this can take a while.</p>}
      <div className="mt-2 h-0.5 w-full overflow-hidden bg-border">
        <div className={cn("h-full bg-primary transition-[width] duration-500", pct === null && "w-1/3 animate-pulse")} style={pct === null ? undefined : { width: `${Math.max(pct, 4)}%` }} />
      </div>
    </div>
  );
}

/** One headline number: dollars big, SOL under it, and what it means in a line. A signed one (profit) is green for a gain and red for a loss. */
function Stat({ label, dollars, sols, pending, empty, signed, about, className }: { label: string; dollars: number; sols: number; pending: boolean; empty?: boolean; signed?: boolean; about: string; className?: string }) {
  const tone = signed && !pending && !empty ? (dollars > 0 ? "text-primary" : dollars < 0 ? "text-destructive" : "") : "";
  return (
    <div className={cn("flex flex-col gap-1 p-5 sm:p-6", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("font-heading text-4xl leading-none font-bold tabular-nums sm:text-5xl", pending && "text-muted-foreground", tone)}>{pending ? "\u2026" : empty ? "\u2014" : signed ? signedUsd(dollars) : usd(dollars)}</p>
      <p className="h-5 text-sm tabular-nums text-muted-foreground">{pending || empty ? "" : signed ? signedSol(sols) : sol(sols)}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{about}</p>
    </div>
  );
}

function Summary({ trades, result, onMore }: { trades: ApiTrades; result: ApiResult | null; onMore?: () => void }) {
  const unknown = result?.unknown ?? 0;
  const unknownPositions = result ? result.positions.filter((p) => p.status === "unknown").length : 0;
  const sells = trades.trades.filter((t) => t.side === "sell").length;
  const tracedSells = result ? result.sells.filter((x) => x.matchedTokens > 0).length : 0;
  const partial = result?.partialSells ?? 0;
  const cov = trades.coverage;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function exportSheet() {
    if (!result) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadFile("/api/fumble/export", result, fumbleFileName(result));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "The spreadsheet could not be made. Try again.");
    } finally {
      setExporting(false);
    }
  }
  const notes = [
    !cov.complete && cov.oldest ? `Trades since ${when(cov.oldest)}. Older ones weren\u2019t read.` : null,
    partial > 0 ? `${partial === 1 ? "1 sell includes" : `${partial} sells include`} coins bought before that, so ${partial === 1 ? "its" : "their"} profit covers only part of the sale.` : null,
    unknown > 0 ? `${unknown === 1 ? "1 sell has" : `${unknown} sells have`} no price history, so ${unknown === 1 ? "it isn't" : "they aren't"} counted in the fumble.` : null,
    unknownPositions > 0 ? `${unknownPositions === 1 ? "1 position has" : `${unknownPositions} positions have`} no price history, so ${unknownPositions === 1 ? "its" : "their"} round-trip isn\u2019t counted.` : null,
    result?.ranOutOfTime ? "The scan ran out of time before pricing every coin." : null,
  ].filter((n): n is string => n !== null);
  return (
    <section aria-label="Summary" className="cut-card pulse-hover border border-border bg-card">
      <div className="grid sm:grid-cols-3">
        <Stat label="Profit" dollars={result?.totalProfitUsd ?? 0} sols={result?.totalProfitSol ?? 0} pending={!result} empty={!!result && tracedSells === 0} signed about="What your sells brought in, minus what those coins cost." />
        <Stat label="Fumbled" dollars={result?.totalFumbleUsd ?? 0} sols={result?.totalFumbleSol ?? 0} pending={!result} about="What your sells left on the table: each coin's highest price since you sold, minus what you sold it for." className="border-t border-border sm:border-t-0 sm:border-l" />
        <Stat
          label="Gave back"
          dollars={result?.totalRoundTripUsd ?? 0}
          sols={result?.totalRoundTripSol ?? 0}
          pending={!result}
          empty={!!result && result.positions.length === 0}
          about="Profit you were up on a coin and gave back: its peak profit, minus the profit you kept."
          className="border-t border-border sm:border-t-0 sm:border-l"
        />
      </div>
      <div className="flex flex-col gap-1 border-t border-border px-5 py-3 text-sm text-muted-foreground sm:px-6">
        <p>
          <span className="font-bold text-foreground tabular-nums">{trades.trades.length}</span> trades, <span className="font-bold text-foreground tabular-nums">{sells}</span> sells
        </p>
        {notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
        {/* The history is saved and stopped short of the wallet's first trade: another scan reads on from there. Only once this scan has finished. */}
        {result && (
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            {cov.extendable && onMore && (
              <button type="button" onClick={onMore} className="underline underline-offset-4 transition-colors hover:text-primary">
                Scan further back
              </button>
            )}
            <button type="button" onClick={exportSheet} disabled={exporting} className="underline underline-offset-4 transition-colors hover:text-primary disabled:opacity-60">
              {exporting ? "Preparing spreadsheet" : "Download spreadsheet"}
            </button>
          </p>
        )}
        {exportError && <p className="text-destructive">{exportError}</p>}
      </div>
    </section>
  );
}

/* The cells of the table, shared by the wide table and the phone list. */

function CoinCell({ row, tokens }: { row: Row; tokens: ApiTrades["tokens"] }) {
  const { trade } = row;
  const label = tokenLabel(trade.token, tokens);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn("inline-flex h-5 w-10 shrink-0 items-center justify-center border text-xs font-bold", trade.side === "buy" ? "border-primary text-primary" : "border-foreground/40 text-foreground")}>{trade.side === "buy" ? "Buy" : "Sell"}</span>
      <a href={explorerUrl(trade.token)} target="_blank" rel="noreferrer" className="shrink-0 font-bold underline-offset-4 hover:text-primary hover:underline" title={trade.token}>
        {label.ticker}
      </a>
      {label.name && <span className="truncate text-muted-foreground">{label.name}</span>}
    </span>
  );
}

function PnlView({ cell }: { cell: PnlCell }) {
  if (cell.kind === "none") return <span className="text-muted-foreground">&mdash;</span>;
  // Waiting for the rest of the history, not for prices: a sell's profit needs the buys before it.
  if (cell.kind === "pending") return <span className="animate-pulse text-muted-foreground" title="Waiting for the rest of the history">&hellip;</span>;
  if (cell.kind === "unknown")
    return (
      <span className="text-muted-foreground" title="None of these coins were bought in the part of the history that was read, so what they cost is not known.">
        Cost unknown
      </span>
    );
  const gain = cell.sol >= 0;
  const detail = [cell.usd !== null ? signedSol(cell.sol) : null, cell.partial ? "part of the sale" : null].filter(Boolean).join(", ");
  return (
    <>
      <span className={cn("block font-bold tabular-nums", gain ? "text-primary" : "text-destructive")}>{cell.usd !== null ? signedUsd(cell.usd) : signedSol(cell.sol)}</span>
      {detail && <span className="block text-xs whitespace-nowrap text-muted-foreground">{detail}</span>}
    </>
  );
}

function FumbleView({ cell }: { cell: FumbleCell }) {
  if (cell.kind === "none") return <span className="text-muted-foreground">&mdash;</span>;
  if (cell.kind === "pricing") return <span className="animate-pulse text-muted-foreground">Pricing</span>;
  if (cell.kind === "sold-well") return <span className="text-muted-foreground">No fumble</span>;
  if (cell.kind === "unknown")
    return (
      <span className="text-muted-foreground" title={cell.reason}>
        No price data
      </span>
    );
  return (
    <>
      <span className="block font-bold tabular-nums text-destructive">{usd(cell.usd)}</span>
      <span className="block text-xs whitespace-nowrap text-muted-foreground">
        {sol(cell.sol)}, {times(cell.peakMultiple)} after
      </span>
    </>
  );
}

function TripView({ cell }: { cell: RoundTripCell }) {
  if (cell.kind === "none") return <span className="text-muted-foreground">&mdash;</span>;
  if (cell.kind === "kept") return <span className="text-muted-foreground">Sold near the peak</span>;
  if (cell.kind === "unknown")
    return (
      <span className="text-muted-foreground" title={cell.reason}>
        No price data
      </span>
    );
  return (
    <>
      <span className="block font-bold tabular-nums text-destructive">{usd(cell.usd)}</span>
      <span className="block text-xs whitespace-nowrap text-muted-foreground">
        {sol(cell.sol)}, {Math.round(cell.share * 100)}% of its profit
      </span>
    </>
  );
}

/**
 * The trades, in the same table the Wayback results use: a bordered box, a header that stays put, striped rows, and a first column that
 * stays put when it scrolls sideways. On a phone the rows stack instead, because six columns do not fit.
 */
function TradeTable({ rows, tokens, pnl, done }: { rows: Row[]; tokens: ApiTrades["tokens"]; pnl: ApiTrades["pnl"]; done: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No token trades of 0.1 SOL or more in the part of the history that was read.</p>;
  const head = "sticky top-0 z-10 bg-card text-sm text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]";
  return (
    <section aria-label="Trades" className="overflow-x-auto border border-border bg-background/80 backdrop-blur-xl">
      <Table className="min-w-[860px]" containerClassName="hidden max-h-[40rem] overflow-auto sm:block">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "left-0 z-20 shadow-[inset_0_-1px_0_var(--border),inset_-1px_0_0_var(--border)]")}>When</TableHead>
            <TableHead className={head}>Coin</TableHead>
            <TableHead className={cn(head, "text-right")}>Size</TableHead>
            <TableHead className={cn(head, "text-right")}>PnL</TableHead>
            <TableHead className={cn(head, "text-right")}>Fumble</TableHead>
            <TableHead className={cn(head, "text-right")}>Gave back</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.trade.signature} className="align-top odd:bg-muted/40 hover:bg-muted/60">
              <TableCell className="sticky left-0 z-[5] bg-card font-bold whitespace-nowrap shadow-[inset_-1px_0_0_var(--border)]">{when(r.trade.time)}</TableCell>
              <TableCell>
                <CoinCell row={r} tokens={tokens} />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{r.trade.sol.toFixed(2)} SOL</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <PnlView cell={pnlCell(r, done, pnl)} />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <FumbleView cell={fumbleCell(r, done)} />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <TripView cell={roundTripCell(r)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ul className="sm:hidden">
        {rows.map((r) => (
          <PhoneRow key={r.trade.signature} row={r} tokens={tokens} pnl={pnl} done={done} />
        ))}
      </ul>
    </section>
  );
}

function PhoneRow({ row, tokens, pnl: early, done }: { row: Row; tokens: ApiTrades["tokens"]; pnl: ApiTrades["pnl"]; done: boolean }) {
  const pnl = pnlCell(row, done, early);
  const fumble = fumbleCell(row, done);
  const trip = roundTripCell(row);
  const line = "flex items-baseline justify-between gap-3";
  return (
    <li className="flex flex-col gap-1 border-b border-border px-3 py-3 text-sm odd:bg-muted/40 last:border-0">
      <div className={line}>
        <CoinCell row={row} tokens={tokens} />
        <span className="shrink-0 tabular-nums">{row.trade.sol.toFixed(2)} SOL</span>
      </div>
      <div className={line}>
        <span className="text-muted-foreground">{when(row.trade.time)}</span>
        {pnl.kind !== "none" && (
          <span className="text-right">
            <PnlView cell={pnl} />
          </span>
        )}
      </div>
      {fumble.kind !== "none" && (
        <div className={line}>
          <span className="text-muted-foreground">Fumble</span>
          <span className="text-right">
            <FumbleView cell={fumble} />
          </span>
        </div>
      )}
      {trip.kind !== "none" && (
        <div className={line}>
          <span className="text-muted-foreground">Gave back</span>
          <span className="text-right">
            <TripView cell={trip} />
          </span>
        </div>
      )}
    </li>
  );
}
