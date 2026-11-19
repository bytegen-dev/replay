"use client";

import { AlertTriangle, ArrowRightLeft, History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import { AmountInput } from "@/components/AmountInput";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { DOWN, LineChart, UP } from "@/components/LineChart";
import { MonthPicker, formatMonth } from "@/components/MonthPicker";
import { RollText } from "@/components/RollText";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { CURRENCIES, isCurrency } from "@/lib/fxCurrencies.ts";
import type { FxDcaResult } from "@/lib/fxDca.ts";
import { fmtPct, fmtPrice } from "@/lib/format.ts";
import { currentMonth } from "@/lib/months.ts";
import { cn } from "@/lib/utils";
import { cleanAmount, formatAmountInput, parseAmount, decodeRange, encodeRange, readQuery, shiftYm, writeQuery } from "@/lib/urlState.ts";

interface Cur {
  code: string;
  name: string;
  symbol: string;
}
interface FxResponse {
  from: Cur;
  to: Cur;
  amount: number;
  startMonth: string;
  endMonth: string;
  today: string;
  result: FxDcaResult;
  sources: { label: string; url: string }[];
  warnings: string[];
}

const money = (n: number, c: Cur) => `${c.symbol}${n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 })}`;
function CurrencySelect({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <CurrencyPicker id={id} value={value} onChange={onChange} />
    </div>
  );
}

/** The Currencies tab: spend a fixed amount of one currency on another every month, and see what it came to. */
export function FxPanel() {
  // Dollars spent on euros to start with; the swap button flips them.
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("EUR");
  const [amount, setAmount] = useState("500");
  const [end] = useState(() => shiftYm(currentMonth(), -1));
  const [endMonth, setEndMonth] = useState(end);
  const [startMonth, setStartMonth] = useState(() => shiftYm(end, -119));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FxResponse | null>(null);
  const [restored, setRestored] = useState(false);
  // A link with run=1 (the footer timeline makes them) runs the check as soon as the form is filled in.
  const autoRun = useRef(false);

  // Bring back what the address bar remembers (and keep it up to date below), so a reload keeps the pair, amount and range.
  useEffect(() => {
    const id = setTimeout(() => {
      const q = readQuery();
      const f = q.get("from_ccy")?.toUpperCase();
      const t = q.get("to_ccy")?.toUpperCase();
      if (f && isCurrency(f)) setFrom(f);
      if (t && isCurrency(t)) setTo(t);
      const a = cleanAmount(q.get("amt"));
      if (a) setAmount(formatAmountInput(a));
      const r = decodeRange(q, end);
      if (r) {
        setStartMonth(r.start);
        setEndMonth(r.end);
      }
      if (q.get("run") === "1") autoRun.current = true;
      setRestored(true);
    }, 0);
    return () => clearTimeout(id);
  }, [end]);
  useEffect(() => {
    if (!restored) return;
    writeQuery({ tab: "fx", from_ccy: from, to_ccy: to, amt: cleanAmount(amount) ?? undefined, ...encodeRange(startMonth, endMonth, end) });
  }, [restored, from, to, amount, startMonth, endMonth, end]);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, to, amount: parseAmount(amount), startMonth, endMonth }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.fields ? Object.values(j.fields as Record<string, string>).join(" ") : (j?.error ?? `Request failed (${res.status})`));
      setData(j as FxResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!restored || !autoRun.current) return;
    autoRun.current = false;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  function preset(years: number) {
    setEndMonth(end);
    setStartMonth(shiftYm(end, -(years * 12 - 1)));
  }

  const r = data?.result;
  const up = !!r && r.rateToday !== null && r.averageRate !== null && r.rateToday >= r.averageRate;
  const points = r ? r.rows.filter((row) => row.rate !== null).map((row) => ({ x: Date.parse(`${row.date}T00:00:00Z`), y: row.rate! })) : [];
  const summary = !(parseAmount(amount) > 0) ? "Enter how much you spend each month." : `${CURRENCIES.find((c) => c.code === from)?.symbol}${parseAmount(amount).toLocaleString("en-US")} a month into ${to}, ${formatMonth(startMonth)} to ${formatMonth(endMonth)}.`;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={run} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          {/* What you buy on the left, what you spend on the right. */}
          <CurrencySelect id="fx-to" value={to} onChange={setTo} label="You buy" />
          <button type="button" aria-label="Swap the two currencies" onClick={() => (setFrom(to), setTo(from))} className="form-control-h hidden items-center justify-center border border-border px-3 text-muted-foreground hover:border-primary hover:text-primary sm:flex">
            <ArrowRightLeft className="size-4" aria-hidden />
          </button>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fx-amount" className="text-sm text-muted-foreground">
              You spend each month
            </Label>
            <div className="flex">
              <CurrencyPicker id="fx-from" ariaLabel="Currency you spend" variant="compact" value={from} onChange={setFrom} className="w-[6.5rem] shrink-0 border-r-0" />
              <AmountInput id="fx-amount" value={amount} onValueChange={setAmount} className="form-control-h min-w-0 flex-1 text-sm" autoComplete="off" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:max-w-xl">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm text-muted-foreground">Start month</Label>
            <MonthPicker id="fx-start" value={startMonth} minYear={1957} max={endMonth} onChange={setStartMonth} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm text-muted-foreground">End month</Label>
            <MonthPicker id="fx-end" value={endMonth} minYear={1957} min={startMonth} onChange={setEndMonth} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="mr-1 text-sm text-muted-foreground">Quick range</span>
          {[5, 10, 20, 40].map((y) => (
            <button key={y} type="button" onClick={() => preset(y)} className="h-8 border border-border px-3 text-xs text-muted-foreground hover:border-primary hover:text-foreground sm:text-sm">
              {y} years
            </button>
          ))}
          <span className="text-xs text-muted-foreground">up to last month</span>
        </div>
        <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-sm leading-snug text-muted-foreground">{summary}</p>
          <Button type="submit" disabled={loading} className="form-cta h-12 w-full shrink-0 gap-2 rounded-none border-2 border-primary px-8 text-base font-bold sm:w-auto sm:min-w-56">
            {loading ? <MarkLoader className="size-5" /> : <History className="size-5" aria-hidden />}
            {loading ? "Checking rates" : "See what it's worth"}
          </Button>
        </div>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 border border-border p-4 text-sm font-bold">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {data && r && !loading && (
        <section aria-label="Currency result" className="reveal flex flex-col gap-5 border-t border-border pt-6">
          {/* Keyed by the result, so the bar grows and the text rolls in again on every run. */}
          <div key={`${r.spent}-${r.held}-${data.from.code}-${data.to.code}`} className="relative pl-4">
            <span aria-hidden className="accent-grow absolute top-0 left-0 h-full w-0.5 bg-primary" />
            {(() => {
              const parts: { t: string; b?: boolean }[] = [
                { t: `${money(data.amount, data.from)} a month for ` },
                { t: r.pricedMonths === r.months ? `${r.months} months` : `${r.pricedMonths} of ${r.months} months`, b: true },
                { t: " bought " },
                { t: money(r.held, data.to), b: true },
                { t: " for " },
                { t: money(r.spent, data.from), b: true },
                { t: "." },
                ...(r.valueToday !== null && r.gain !== null
                  ? [
                      { t: " At today's rate that is worth " },
                      { t: money(r.valueToday, data.from), b: true },
                      { t: `, ${r.gain >= 0 ? "a gain" : "a loss"} of ` },
                      { t: money(Math.abs(r.gain), data.from), b: true },
                      { t: ` (${fmtPct(r.gainPct)}).` },
                    ]
                  : []),
              ];
              let chars = 0;
              return (
                <p className="text-base leading-relaxed sm:text-lg">
                  {parts.map((p, i) => {
                    const delay = 440 + chars * 6;
                    chars += p.t.length;
                    return <RollText key={i} text={p.t} introDelay={delay} className={p.b ? "font-bold" : undefined} />;
                  })}
                </p>
              );
            })()}
            {r.valueToday !== null && r.gain !== null && (
              <RollText
                introDelay={440 + 140 * 6}
                className="mt-2 block text-sm leading-relaxed text-muted-foreground"
                text={
                  r.gain >= 0
                    ? `${data.to.name} gained against ${data.from.name} over this stretch, so each month's money bought less and less of it, but what you held is worth more in ${data.from.code} now.`
                    : `${data.to.name} lost value against ${data.from.name} over this stretch, so what you bought is worth less in ${data.from.code} today than you spent.`
                }
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {[
              { k: `Spent (${data.from.code})`, v: money(r.spent, data.from) },
              { k: `You hold (${data.to.code})`, v: money(r.held, data.to) },
              { k: "Average rate", v: r.averageRate === null ? "n/a" : fmtPrice(r.averageRate) },
              { k: "Rate today", v: r.rateToday === null ? "n/a" : fmtPrice(r.rateToday) },
              { k: `Worth today (${data.from.code})`, v: r.valueToday === null ? "n/a" : money(r.valueToday, data.from), hi: true },
              { k: "Gain / loss", v: fmtPct(r.gainPct), hi: true },
            ].map((t) => (
              <div key={t.k} className={cn("flex flex-col gap-1 p-4", t.hi ? "bg-secondary" : "bg-card")}>
                <span className="text-sm text-muted-foreground">{t.k}</span>
                <span className="text-base font-bold tabular-nums break-all sm:text-lg">
                  <RollText text={t.v} />
                </span>
              </div>
            ))}
          </div>

          {points.length >= 2 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-bold">
                {data.from.code} per {data.to.code} over time
              </h3>
              <LineChart
                series={[
                  { key: "rate", label: `${data.from.code} per ${data.to.code}`, area: true, dots: true, color: up ? UP : DOWN, points },
                  ...(r.averageRate !== null ? [{ key: "avg", label: "Your average rate", dashed: true, points: points.map((p) => ({ x: p.x, y: r.averageRate! })) }] : []),
                ]}
                yFormat={fmtPrice}
                zeroBaseline={false}
                ariaLabel={`Line chart of the ${data.from.code} per ${data.to.code} exchange rate from ${formatMonth(data.startMonth)} to ${formatMonth(data.endMonth)}.`}
              />
            </div>
          )}

          {/* Every buy: that month's own rate, what it bought, and what that is worth at today's rate. */}
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-bold">Month by month</h3>
            <p className="text-sm text-muted-foreground">
              Each month&apos;s {data.from.code} buys {data.to.code} at that month&apos;s own rate. &ldquo;Worth today&rdquo; values what that month bought at today&apos;s rate.
            </p>
            <div className="border border-border">
              <Table className="min-w-[640px]" containerClassName="max-h-96 overflow-y-auto">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="hover:bg-transparent">
                    {["Month", "Rate date", `Rate (${data.from.code} per ${data.to.code})`, `You spend (${data.from.code})`, `You get (${data.to.code})`, `Worth today (${data.from.code})`].map((h, i) => (
                      <TableHead key={h} className={cn("sticky top-0 z-10 bg-card text-sm whitespace-normal text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]", i >= 2 && "text-right")}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.rows.map((row) => (
                    <TableRow key={row.month} className="odd:bg-muted/40 hover:bg-muted/60">
                      <TableCell>{row.month}</TableCell>
                      <TableCell>{row.rate === null ? "n/a" : row.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.rate === null ? "n/a" : fmtPrice(row.rate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.rate === null ? "n/a" : money(data.amount, data.from)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.bought === null ? "n/a" : money(row.bought, data.to)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.bought === null || r.rateToday === null ? "n/a" : money(row.bought * r.rateToday, data.from)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {r.lumpSumValue !== null && (
            <p className="text-sm text-muted-foreground">
              For comparison, spending the same {money(r.spent, data.from)} all at once in {formatMonth(data.startMonth)} would be worth <b className="text-foreground">{money(r.lumpSumValue, data.from)}</b> today.
            </p>
          )}

          <ul className="flex flex-col gap-1.5 border border-border p-3 text-sm">
            {data.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Rates from{" "}
            {data.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ", "}
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-foreground">
                  {s.label}
                </a>
              </span>
            ))}
            .
          </p>
        </section>
      )}
    </div>
  );
}
