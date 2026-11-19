"use client";

import { AlertTriangle, Check, Clock, Copy, Loader2 } from "lucide-react";
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
  { value: "base", label: "Base (BASE)" },
  { value: "bsc", label: "BNB Chain (BSC)" },
  { value: "arbitrum", label: "Arbitrum (ARB)" },
  { value: "solana", label: "Solana (SOL)" },
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

/** The price around the moment, with that moment marked. */
function PriceChart({ r }: { r: HistoricalPriceResult }) {
  const points = r.series.map((s) => ({ x: s.t * 1000, y: s.usd }));
  const span = points[points.length - 1].x - points[0].x;
  const isNow = r.when.description.startsWith("now");
  const label = isNow ? "now" : r.when.precision === "day" ? "day's close" : `${r.when.timeUtc} UTC`;
  const name = r.asset.symbol ?? r.asset.name ?? "The price";
  return (
    <div className="flex flex-col gap-2">
      <LineChart
        series={[{ key: "price", label: `${name} price`, area: true, points }]}
        yFormat={formatUsdPrice}
        zeroBaseline={false}
        withClock={span < 3 * 86_400_000}
        marker={{ x: Date.parse(r.when.instantUtc), label }}
        height={230}
        ariaLabel={`Line chart of the ${name} price around ${r.when.description}. The marked moment was ${formatUsdPrice(r.price.usd)}.`}
      />
      <p className="text-xs text-muted-foreground">The marked line is the moment you asked about. Hover or use the arrow keys to read other points. Each point is a {r.price.resolution === "daily" ? "day's close" : r.price.resolution === "hourly snapshot" ? "snapshot" : `${r.price.resolution} candle close`}.</p>
    </div>
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
  const selectContent = "rounded-none border border-border bg-popover ring-0";

  return (
    <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 border border-border bg-card p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4 min-[480px]:col-span-2 lg:col-span-4 lg:grid lg:grid-cols-4">
            <div className="lg:col-span-1">
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
                        {m.label}
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
            <Field id="date" label="Date" error={fieldErrors.date} hint="15/09/2026, September 15, 5 days ago, 3 months ago, yesterday, or now.">
              <Input id="date" className="form-control-h text-sm" value={date} onChange={(e) => setDate(e.target.value)} placeholder="e.g. 15/09/2026 or 5 days ago" autoComplete="off" spellCheck={false} aria-invalid={!!fieldErrors.date} />
              <div className="flex flex-wrap gap-1.5">
                {DATE_CHIPS.map((c) => (
                  <Button key={c} type="button" variant="outline" size="sm" className="h-7 w-auto! rounded-none px-2 text-xs" onClick={() => setDate(c)}>
                    {c}
                  </Button>
                ))}
              </div>
            </Field>
          </div>
          <Field id="time" label="Time (optional)" error={fieldErrors.time} hint="13:40 or 1:40pm. Leave empty for the day's closing price.">
            <Input id="time" className="form-control-h text-sm" value={time} onChange={(e) => setTime(e.target.value)} placeholder="13:40" autoComplete="off" spellCheck={false} aria-invalid={!!fieldErrors.time} />
          </Field>
          <Field id="tz" label="Timezone (optional)" error={fieldErrors.tz} hint="UTC if empty. Try UTC+1, EST or Europe/London.">
            <Input id="tz" className="form-control-h text-sm" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="UTC" autoComplete="off" spellCheck={false} aria-invalid={!!fieldErrors.tz} />
            <Button type="button" variant="outline" size="sm" className="h-7 w-auto! self-start rounded-none px-2 text-xs" onClick={() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)}>
              Use my timezone
            </Button>
          </Field>
        </div>

        <p aria-live="polite" className={`flex items-start gap-2 border-l-2 pl-3 text-sm ${reading && !reading.ok ? "border-foreground font-bold" : "border-border text-muted-foreground"}`}>
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {reading === null ? "Reading your date…" : reading.ok ? <>Reads as <b className="text-foreground">{reading.value.description}</b>{reading.value.assumptions.length > 0 && ` · ${reading.value.assumptions.join(" ")}`}</> : reading.error}
          </span>
        </p>

        <Button type="submit" disabled={loading} className="form-cta h-12 w-full gap-2 rounded-none border-2 border-foreground text-base font-bold tracking-wide transition-transform hover:-translate-y-px active:translate-y-0 disabled:border-border">
          {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          {loading ? "Looking up" : "Get price"}
        </Button>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Or try a ready-made lookup</span>
          <div className="flex flex-wrap gap-2">
            {PRICE_EXAMPLES.map((ex) => (
              <Button key={ex.id} type="button" variant="outline" disabled={loading} className="h-9 w-auto! rounded-none px-3 text-xs sm:text-sm" onClick={() => runExample(ex)}>
                {ex.label}
              </Button>
            ))}
          </div>
        </div>
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
            <h2 className="text-xl font-bold tracking-tight">{result.asset.name ?? result.asset.symbol ?? "Token"}</h2>
            {result.asset.symbol && <span className="text-sm text-muted-foreground">{result.asset.symbol}</span>}
            <Badge variant="outline" className="rounded-none font-normal">
              {result.asset.market === "stock" ? "Stock" : result.asset.market}
            </Badge>
            <Badge variant="outline" className="rounded-none font-normal text-muted-foreground">
              {result.price.resolution}
            </Badge>
          </div>

          <div className="flex flex-col gap-1 border-l-2 border-foreground pl-4">
            <p className="text-3xl font-bold tabular-nums sm:text-4xl">{formatUsdPrice(result.price.usd)}</p>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{result.answer}</p>
          </div>

          {result.series.length >= 3 && <PriceChart r={result} />}

          <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            {[
              { k: "Moment (UTC)", v: result.when.precision === "day" ? `${result.when.dateUtc}, closing price` : asOf(result.when.instantUtc) },
              { k: "Price set", v: result.price.ageSeconds > 60 ? `${asOf(result.price.asOfUtc)} (${formatAge(result.price.ageSeconds)} earlier)` : asOf(result.price.asOfUtc) },
              ...(result.current ? [{ k: "Now", v: `${formatUsdPrice(result.current.usd)} (${result.current.changePercent >= 0 ? "+" : ""}${result.current.changePercent.toLocaleString("en-US")}% since)` }] : []),
              ...(result.price.volumeUsd !== null ? [{ k: "Volume in that period", v: `$${Math.round(result.price.volumeUsd).toLocaleString("en-US")}` }] : []),
              ...(result.price.open !== null ? [{ k: "Open", v: formatUsdPrice(result.price.open) }, { k: "High", v: formatUsdPrice(result.price.high ?? result.price.open) }, { k: "Low", v: formatUsdPrice(result.price.low ?? result.price.open) }, { k: "Close", v: formatUsdPrice(result.price.close ?? result.price.usd) }] : []),
              ...(result.price.splitAdjustedUsd !== undefined ? [{ k: "In today's shares", v: formatUsdPrice(result.price.splitAdjustedUsd) }] : []),
            ].map((c) => (
              <div key={c.k} className="flex flex-col gap-0.5 bg-card p-3">
                <dt className="text-xs text-muted-foreground">{c.k}</dt>
                <dd className="text-sm font-bold break-words tabular-nums">{c.v}</dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-muted-foreground">
            Read as {result.price.basis}. Source:{" "}
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

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">The same lookup from a chat bot or another app:</p>
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
        </section>
      )}
    </div>
  );
}
