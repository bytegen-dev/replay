"use client";

import { ChainLogo } from "@/components/ChainLogo";
import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EquitySearchInput } from "@/components/EquitySearch";
import { LineChart } from "@/components/LineChart";
import { TokenSearchInput } from "@/components/TokenSearch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRICE_EXAMPLES, type PriceExample } from "@/lib/examples.ts";
import type { HistoricalPriceResult } from "@/lib/historicalPrice.ts";
import { formatAge, formatUsdPrice } from "@/lib/priceAt.ts";
import type { Chain, Market } from "@/lib/types.ts";
import { PREFIX_FOR, parseWhen } from "@/lib/when.ts";

const MARKETS: { value: Market; label: string }[] = [
  { value: "ethereum", label: "Ethereum (ETH)" },
  { value: "solana", label: "Solana (SOL)" },
  { value: "base", label: "Base (BASE)" },
  { value: "bsc", label: "BNB Chain (BSC)" },
  { value: "arbitrum", label: "Arbitrum (ARB)" },
  { value: "cardano", label: "Cardano (ADA)" },
  { value: "equity", label: "Stock (STOCK)" },
];

const DATE_CHIPS = ["now", "yesterday", "7 days ago", "30 days ago", "1 year ago"];

type FieldErrors = Partial<Record<"market" | "asset" | "date" | "time" | "tz", string>>;

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-bold">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** The prices around the moment, with that moment marked and its price written on the marker. */
function PriceChart({ r }: { r: HistoricalPriceResult }) {
  const points = r.series.map((s) => ({ x: s.t * 1000, y: s.usd }));
  const span = points[points.length - 1].x - points[0].x;
  const isNow = r.when.description.startsWith("now");
  const when = isNow ? "now" : r.when.precision === "day" ? "close" : `${r.when.timeUtc} UTC`;
  const name = r.asset.symbol ?? r.asset.name ?? "The price";
  return (
    <LineChart
      series={[{ key: "price", label: `${name} price`, area: true, points }]}
      yFormat={formatUsdPrice}
      zeroBaseline={false}
      withClock={span < 3 * 86_400_000}
      marker={{ x: Date.parse(r.when.instantUtc), label: `${when} · ${formatUsdPrice(r.price.usd)}` }}
      height={230}
      ariaLabel={`Line chart of the ${name} price around ${r.when.description}. The marked moment was ${formatUsdPrice(r.price.usd)}.`}
    />
  );
}

const asOf = (iso: string) => iso.replace("T", " ").replace(/:\d{2}Z$/, " UTC");

/** Look up the price of a token or stock at a past moment, typed the way people say it. */
export function PricePanel() {
  const [market, setMarket] = useState<Market>("ethereum");
  const [asset, setAsset] = useState("");
  const [assetName, setAssetName] = useState("");
  const [date, setDate] = useState("yesterday");
  const [time, setTime] = useState("");
  const [tz, setTz] = useState("");
  // The clock is read after mount, so what is shown never depends on when the page was built.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNowMs(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<HistoricalPriceResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // How the date and time will be read, shown before anything is submitted.
  const reading = useMemo(() => (nowMs === null ? null : parseWhen({ date, time, tz }, nowMs)), [date, time, tz, nowMs]);

  async function lookup(f: { market: Market; asset: string; date: string; time: string; tz: string }) {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/historical-price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ market: PREFIX_FOR[f.market], asset: f.asset.trim(), date: f.date, time: f.time, tz: f.tz }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        // Problems with specific inputs show beside those inputs, so no banner repeating them.
        if (j?.fields && Object.keys(j.fields).length > 0) {
          setFieldErrors(j.fields);
          setResult(null);
          return;
        }
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setResult(j as HistoricalPriceResult);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void lookup({ market, asset, date, time, tz });
  }

  function runExample(ex: PriceExample) {
    setMarket(ex.market);
    setAsset(ex.address);
    setAssetName("");
    setDate(ex.date);
    setTime(ex.time ?? "");
    setTz("");
    void lookup({ market: ex.market, asset: ex.address, date: ex.date, time: ex.time ?? "", tz: "" });
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setError("Couldn't copy. Select the text and copy it by hand.");
    }
  }

  const line = [asset.trim(), PREFIX_FOR[market], time.trim(), date.trim(), tz.trim()].filter(Boolean).join(" ");
  const command = `/historical-price ${line}`;
  const apiUrl = () => `${window.location.origin}/api/v1/historical-price?format=text&q=${encodeURIComponent(line)}`;
  // Inside the open list only the ticked item keeps its colour; the others go grey. The value shown on the closed select is coloured.
  const selectContent = "rounded-none border border-border bg-popover ring-0 [&_[data-slot=select-item]:not([data-state=checked])_.chain-logo]:grayscale [&_[data-slot=select-item]:not([data-state=checked])_.chain-logo]:opacity-70";

  // What the result shows beside the price: the candle when there is one, and the split figure for a stock that has split.
  const details: { k: string; v: string }[] = result
    ? [
        ...(result.price.open !== null
          ? [
              { k: "Open", v: formatUsdPrice(result.price.open) },
              { k: "High", v: formatUsdPrice(result.price.high ?? result.price.open) },
              { k: "Low", v: formatUsdPrice(result.price.low ?? result.price.open) },
              { k: "Close", v: formatUsdPrice(result.price.close ?? result.price.usd) },
            ]
          : []),
        ...(result.price.volumeUsd !== null ? [{ k: "Volume", v: `$${Math.round(result.price.volumeUsd).toLocaleString("en-US")}` }] : []),
        ...(result.price.splitAdjustedUsd !== undefined ? [{ k: "In today's shares", v: formatUsdPrice(result.price.splitAdjustedUsd) }] : []),
      ]
    : [];

  return (
    <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5 border border-border bg-card p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
          <div className="min-[480px]:col-span-2 lg:col-span-4 lg:grid lg:grid-cols-4 lg:gap-4">
            <div className="mb-4 lg:mb-0">
              <Field id="market" label="Chain" error={fieldErrors.market}>
                <Select
                  value={market}
                  onValueChange={(v) => {
                    setMarket(v as Market);
                    setFieldErrors((e) => ({ ...e, market: undefined, asset: undefined }));
                  }}
                >
                  <SelectTrigger id="market" className="form-control-h w-full rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContent}>
                    {MARKETS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="rounded-none">
                        <span className="flex items-center gap-2">
                          <ChainLogo chain={m.value} />
                          {m.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="lg:col-span-3">
              {market === "equity" ? (
                <Field id="asset" label="Search or enter a ticker" error={fieldErrors.asset}>
                  <EquitySearchInput
                    id="asset"
                    value={asset}
                    invalid={!!fieldErrors.asset}
                    onChange={(v) => {
                      setAsset(v);
                      setAssetName("");
                    }}
                    onPick={(h) => {
                      setAsset(h.symbol);
                      setAssetName(h.name);
                      setFieldErrors((e) => ({ ...e, asset: undefined }));
                    }}
                  />
                  {assetName && <p className="text-xs text-muted-foreground">{assetName}</p>}
                </Field>
              ) : (
                <Field id="asset" label={market === "cardano" ? "Search or paste policy ID" : "Search or paste contract address"} error={fieldErrors.asset}>
                  <TokenSearchInput
                    id="asset"
                    value={asset}
                    chain={market as Chain}
                    invalid={!!fieldErrors.asset}
                    placeholder={market === "cardano" ? "Token name, or a 56-character policy ID" : market === "solana" ? "Token name, or a base58 mint address" : "Token name, or 0x..."}
                    onChange={setAsset}
                    onPick={(h) => {
                      setMarket(h.chain);
                      setAsset(h.address);
                      setFieldErrors((e) => ({ ...e, asset: undefined, market: undefined }));
                    }}
                  />
                </Field>
              )}
            </div>
          </div>

          <div className="min-[480px]:col-span-2">
            <Field id="date" label="Date" error={fieldErrors.date}>
              <Input id="date" className="form-control-h text-sm" value={date} onChange={(e) => setDate(e.target.value)} placeholder="15/09/2026, September 15, or 5 days ago" autoComplete="off" spellCheck={false} aria-invalid={!!fieldErrors.date} />
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {DATE_CHIPS.map((c) => (
                  <button key={c} type="button" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setDate(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field id="time" label="Time" error={fieldErrors.time} hint="Optional. Empty means the day's close.">
            <Input id="time" className="form-control-h text-sm" value={time} onChange={(e) => setTime(e.target.value)} placeholder="13:40 or 1:40pm" autoComplete="off" spellCheck={false} aria-invalid={!!fieldErrors.time} />
          </Field>
          <Field id="tz" label="Timezone" error={fieldErrors.tz}>
            <Input id="tz" className="form-control-h text-sm" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="UTC" autoComplete="off" spellCheck={false} aria-invalid={!!fieldErrors.tz} />
            <button type="button" className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)}>
              Use my timezone
            </button>
          </Field>
        </div>

        {/* The one thing this page does that others don't: it shows how your words were read, before you commit. */}
        <p aria-live="polite" className={`border-l-2 pl-4 text-base leading-snug ${reading && !reading.ok ? "border-foreground font-bold" : "border-foreground"}`}>
          {reading === null ? (
            <span className="text-muted-foreground">Reading your date…</span>
          ) : reading.ok ? (
            <>
              <span className="text-muted-foreground">Reads as </span>
              <b>{reading.value.description}</b>
              {reading.value.assumptions.length > 0 && <span className="mt-1 block text-sm text-muted-foreground">{reading.value.assumptions.join(" ")}</span>}
            </>
          ) : (
            reading.error
          )}
        </p>

        <Button type="submit" disabled={loading} className="form-cta h-12 w-full gap-2 rounded-none border-2 border-foreground text-base font-bold tracking-wide transition-transform hover:-translate-y-px active:translate-y-0 disabled:border-border">
          {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          {loading ? "Looking up" : "Get price"}
        </Button>

        {/* Shortcuts, not controls: plain underlined text, so they don't read as more fields or buttons. */}
        <p className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Try one:</span>
          {PRICE_EXAMPLES.map((ex) => (
            <button key={ex.id} type="button" disabled={loading} className="underline underline-offset-4 hover:text-muted-foreground disabled:opacity-50" onClick={() => runExample(ex)}>
              {ex.label}
            </button>
          ))}
        </p>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 border border-border p-4 text-sm font-bold">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {result && !loading && (
        <section className="flex flex-col gap-5 border border-border bg-card p-4 sm:p-6" aria-label="Price result">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight">{result.asset.name ?? result.asset.symbol ?? "Token"}</h2>
            {result.asset.symbol && <span className="text-sm text-muted-foreground">{result.asset.symbol}</span>}
            <Badge variant="outline" className="rounded-none font-normal text-muted-foreground">
              {result.asset.market === "stock" ? "Stock" : result.asset.market}
            </Badge>
          </div>

          {/* The answer, once: the price, when it was, and how it has moved. */}
          <div className="flex flex-col gap-1.5 border-l-2 border-foreground pl-4">
            <p className="text-4xl font-bold tabular-nums sm:text-5xl">{formatUsdPrice(result.price.usd)}</p>
            <p className="text-sm sm:text-base">
              {result.when.description}
              {result.current && (
                <span className="text-muted-foreground">
                  {" "}
                  · now {formatUsdPrice(result.current.usd)}, {result.current.changePercent >= 0 ? "+" : ""}
                  {result.current.changePercent.toLocaleString("en-US")}% since
                </span>
              )}
            </p>
          </div>

          {result.series.length >= 3 && <PriceChart r={result} />}

          {details.length > 0 && (
            <dl className="flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-3">
              {details.map((c) => (
                <div key={c.k} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{c.k}</dt>
                  <dd className="text-sm font-bold tabular-nums">{c.v}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="text-sm text-muted-foreground">
            {result.price.resolution} price: {result.price.basis}
            {result.price.ageSeconds > 60 && `, set ${formatAge(result.price.ageSeconds)} earlier (${asOf(result.price.asOfUtc)})`}. Source:{" "}
            <a href={result.source.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-foreground">
              {result.source.label}
            </a>
            .
          </p>

          {(result.warnings.length > 0 || result.when.assumptions.length > 0) && (
            <ul className="flex flex-col gap-1.5 border border-border p-3 text-sm">
              {[...result.when.assumptions, ...result.warnings].map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <details className="group border-t border-border pt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Use this lookup in a bot or app</summary>
            <div className="mt-3 flex flex-col gap-2">
              {[
                { key: "command", label: "Bot command", text: command },
                { key: "api", label: "API call (plain text for chat)", text: null as string | null },
              ].map((row) => (
                <div key={row.key} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-xs break-all">{row.text ?? apiUrl()}</code>
                  <Button type="button" variant="outline" className="form-control-h w-full rounded-none sm:w-auto" onClick={() => copy(row.text ?? apiUrl(), row.key)} aria-label={`Copy ${row.label}`}>
                    {copied === row.key ? <Check /> : <Copy />}
                    {copied === row.key ? "Copied" : "Copy"}
                  </Button>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
