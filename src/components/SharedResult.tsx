import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prepare } from "@/lib/exportData.ts";
import { fmtNum, fmtPct, fmtPrice, fmtSigned, fmtUsd, NA } from "@/lib/format.ts";
import type { SharePayload } from "@/lib/share.ts";

const WARN_CODES = new Set(["nearest-day", "low-volume", "outlier"]);

/** Read-only view of a saved result. Totals are recomputed from the saved rows, as the exports do. */
export function SharedResult({ data }: { data: SharePayload }) {
  const { buys, summary, decimals } = prepare(data);
  const symbol = data.tokenLabel.replace(/^\$/, "") || "tokens";
  const months = `${summary.pricedMonths} ${summary.pricedMonths === 1 ? "month" : "months"}`;
  const loss = (summary.gain ?? 0) < 0;

  const tiles = [
    { key: "Total invested", value: fmtUsd(summary.invested) },
    { key: "Total tokens", value: fmtNum(summary.tokens, decimals) },
    { key: "Avg buy price", value: fmtPrice(summary.avgPrice) },
    { key: "Price today", value: fmtPrice(summary.priceToday) },
    { key: "Value today", value: fmtUsd(summary.valueToday), highlight: true },
    { key: "Gain / loss", value: fmtSigned(summary.gain), highlight: true },
    { key: "Gain / loss %", value: fmtPct(summary.gainPct), highlight: true },
  ];

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <section className="border border-border bg-card p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight">{data.tokenName || data.tokenLabel || "Unknown token"}</h2>
          {data.chain && (
            <Badge variant="outline" className="rounded-none font-normal">
              {data.chain}
            </Badge>
          )}
          {data.basis && (
            <Badge variant="outline" className="rounded-none font-normal text-muted-foreground">
              {data.basis}
            </Badge>
          )}
        </div>
        <div className="border-l-2 border-foreground pl-4">
          {summary.pricedMonths === 0 ? (
            <p className="text-base leading-relaxed sm:text-lg">No month in this result has a price, so there is nothing to total.</p>
          ) : (
            <p className="text-base leading-relaxed sm:text-lg">
              {fmtUsd(data.amount)} a month for <b>{months}</b> bought{" "}
              <b>
                {fmtNum(summary.tokens, decimals)} {symbol}
              </b>{" "}
              for <b>{fmtUsd(summary.invested)}</b>.
              {summary.valueToday !== null && summary.gain !== null && (
                <>
                  {" "}
                  Today that is worth <b>{fmtUsd(summary.valueToday)}</b>, a {loss ? "loss" : "gain"} of{" "}
                  <b>{fmtUsd(Math.abs(summary.gain))}</b> ({fmtPct(summary.gainPct)}).
                </>
              )}
            </p>
          )}
        </div>
        {data.address && <p className="mt-4 text-xs break-all text-muted-foreground">{data.address}</p>}
      </section>

      {data.warnings.length > 0 && (
        <div className="flex flex-col gap-1 border border-border p-4 text-sm">
          {data.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-px border border-border bg-border min-[400px]:grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(({ key, value, highlight }) => (
          <div key={key} className={`flex flex-col gap-1 p-4 ${highlight ? "bg-secondary" : "bg-card"}`}>
            <span className="text-xs tracking-wide text-muted-foreground uppercase">{key}</span>
            <span className="text-base font-bold break-all tabular-nums sm:text-lg">{value}</span>
          </div>
        ))}
      </div>

      {summary.skippedMonths > 0 && (
        <p className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {summary.skippedMonths} of {buys.length} month(s) have no price (n/a) and are excluded from every total: {summary.skipped.join(", ")}.
          </span>
        </p>
      )}

      <div className="overflow-x-auto border border-border">
        <Table className="min-w-[860px]">
          <TableHeader className="bg-card">
            <TableRow className="hover:bg-transparent">
              {(["Month", "Price date", "Price (USD)", "Amount (USD)", "Tokens bought", "Value today (USD)", "Source", "Note"] as const).map((h, i) => (
                <TableHead key={h} className={`text-sm text-muted-foreground ${i >= 2 && i <= 5 ? "text-right" : ""}`}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {buys.map((b) => (
              <TableRow key={b.month} className="align-top odd:bg-muted/40">
                <TableCell>{b.month}</TableCell>
                <TableCell>{b.priceDate ?? (b.manual ? "manual" : NA)}</TableCell>
                <TableCell className="text-right tabular-nums">{b.price === null ? NA : fmtPrice(b.price)}</TableCell>
                <TableCell className="text-right tabular-nums">{b.tokens === null ? NA : fmtNum(b.amount, 2)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(b.tokens, decimals)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(b.valueToday)}</TableCell>
                <TableCell>{b.source === "none" ? NA : <Badge variant="outline" className="rounded-none">{b.source}</Badge>}</TableCell>
                <TableCell className="text-xs whitespace-normal">
                  {b.notes.map((n) => (
                    <div key={n.code + n.text} className="flex items-start gap-1">
                      {WARN_CODES.has(n.code) && <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-label="warning" />}
                      <span>{n.text}</span>
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data.sources.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Sources:{" "}
          {data.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ", "}
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-foreground">
                {s.label || s.url}
              </a>
            </span>
          ))}
          . Prices are daily points (UTC), priced on {data.currentPriceDate || "the day it was saved"}.
        </p>
      )}
    </div>
  );
}
