import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format.ts";
import { type LeverageResult } from "@/lib/leverage.ts";
import { cn } from "@/lib/utils";

/**
 * What the same buys would have done as leveraged, futures-style positions: the totals, how many were liquidated, and each
 * position. The plain (unleveraged) result stays above it for comparison.
 */
export function LeverageCard({ result, plainGainPct, sold }: { result: LeverageResult; plainGainPct: number | null; sold?: boolean }) {
  const { settings, summary, positions } = result;
  const when = sold ? "at sale" : "today";
  const up = summary.gain >= 0;
  const tiles = [
    { k: "Money used", v: fmtUsd(summary.invested), note: summary.topUps > 0 ? `${fmtUsd(summary.topUps)} of it added later` : undefined },
    { k: `Worth ${when}`, v: fmtUsd(summary.value), hi: true },
    { k: "Gain / loss", v: `${fmtUsd(summary.gain)} (${fmtPct(summary.gainPct)})`, hi: true },
    { k: "Without leverage", v: plainGainPct === null ? "n/a" : fmtPct(plainGainPct) },
    { k: "Liquidated", v: `${summary.liquidated} of ${summary.positions}` },
    { k: "Funding and fees", v: fmtUsd(summary.funding + summary.fees) },
  ];

  return (
    <section aria-label="Leveraged result" className="flex flex-col gap-5 border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight">With {settings.leverage}x leverage</h2>
        <Badge variant="outline" className="rounded-none font-normal text-muted-foreground">
          Futures style
        </Badge>
      </div>

      <div className={cn("border-l-2 pl-4", up ? "border-primary" : "border-destructive")}>
        <p className="text-base leading-relaxed sm:text-lg">
          The same buys with {settings.leverage}x leverage put in <b>{fmtUsd(summary.invested)}</b> and were worth <b>{fmtUsd(summary.value)}</b> {when}, {up ? "a gain" : "a loss"} of <b>{fmtUsd(Math.abs(summary.gain))}</b> ({fmtPct(summary.gainPct)}).
          {summary.liquidated > 0 && (
            <>
              {" "}
              <b>{summary.liquidated}</b> of {summary.positions} {summary.positions === 1 ? "position was" : "positions were"} liquidated, losing {summary.liquidated === 1 ? "its" : "their"} whole margin.
            </>
          )}
          {summary.stopped > 0 && (
            <>
              {" "}
              {summary.stopped} {summary.stopped === 1 ? "position was" : "positions were"} closed at the maximum loss.
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.k} className={cn("flex flex-col gap-1 p-4", t.hi ? "bg-secondary" : "bg-card")}>
            <span className="text-sm text-muted-foreground">{t.k}</span>
            <span className="text-base font-bold tabular-nums break-words sm:text-lg">{t.v}</span>
            {t.note && <span className="text-xs text-muted-foreground">{t.note}</span>}
          </div>
        ))}
      </div>

      <div className="border border-border">
        <Table className="min-w-[860px]" containerClassName="max-h-[28rem] overflow-auto">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              {["Month", "Opened at", "Liquidated below", "Status", "Margin added", "Funding", "Fees", `Worth ${when}`].map((h, i) => (
                <TableHead key={h} className={cn("sticky top-0 z-10 bg-card text-sm whitespace-normal text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]", i === 0 && "left-0 z-20", i >= 4 && "text-right")}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((p) => (
              <TableRow key={p.month} className="odd:bg-muted/40 hover:bg-muted/60">
                <TableCell className="sticky left-0 z-[5] bg-card font-bold shadow-[inset_-1px_0_0_var(--border)]">{p.month}</TableCell>
                <TableCell className="tabular-nums">{fmtPrice(p.openPrice)}</TableCell>
                <TableCell className="tabular-nums">{fmtPrice(p.liquidationPrice)}</TableCell>
                <TableCell>
                  {p.status === "liquidated" ? (
                    <span className="flex items-center gap-1 font-bold text-destructive">
                      <AlertTriangle className="size-3.5" aria-hidden /> Liquidated {p.closeDate}
                    </span>
                  ) : p.status === "stopped" ? (
                    <span className="font-bold">Stopped {p.closeDate}</span>
                  ) : (
                    <span className="text-muted-foreground">Open</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.topUps > 0 ? `${fmtUsd(p.topUps)} (${p.topUpCount}x)` : "none"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(p.funding)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(p.fees)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(p.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Each buy opened its own position with {settings.leverage}x leverage. Funding was charged at {settings.fundingApr}% a year on the position&apos;s value, there was a 0.045% fee on the way in and out, and a position is liquidated when its margin falls to a small maintenance level (1% of its value, less at very high leverage).
        {settings.topUp ? ` Margin was added near liquidation${settings.topUpMax !== undefined ? `, up to ${fmtUsd(settings.topUpMax)} per position` : ""}.` : ""}
        {settings.maxLoss !== undefined || settings.maxLossPct !== undefined ? ` A position closed when it had lost ${[settings.maxLossPct !== undefined ? `${settings.maxLossPct}% of its margin` : "", settings.maxLoss !== undefined ? fmtUsd(settings.maxLoss) : ""].filter(Boolean).join(" or ")}.` : ""} It uses daily closing prices, so it can&apos;t see a price spike inside a day that would have liquidated a position sooner: real trading can be harsher than this. A past result says nothing about the future, and leverage can lose more than the money you put in on a venue that doesn&apos;t isolate margin.
      </p>
    </section>
  );
}
