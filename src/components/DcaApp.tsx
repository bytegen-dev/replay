"use client";

import { AlertTriangle, Calculator, Check, Copy, FileSpreadsheet, Loader2, Settings, Share2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ParametersFormSkeleton, ResultsLoadingSkeleton } from "@/components/DcaSkeletons";
import { MonthPicker } from "@/components/MonthPicker";
import { EquitySearchInput } from "@/components/EquitySearch";
import { GrowthChart } from "@/components/GrowthChart";
import { StockPicker } from "@/components/StockPicker";
import { TokenDetails } from "@/components/TokenDetails";
import { TokenSearchInput } from "@/components/TokenSearch";
import { type XStock } from "@/lib/xstocks.ts";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadFile } from "@/lib/download.ts";
import { EXAMPLES, exampleRequest, type Example } from "@/lib/examples.ts";
import { xlsxFileName, type ExportPayload } from "@/lib/exportData.ts";
import { fmtNum, fmtPct, fmtPrice, fmtSigned, fmtUsd, NA } from "@/lib/format.ts";
import { buildBuys, chooseDecimals, summarize, type Overrides, type Summary } from "@/lib/math.ts";
import { basisBadgeLabel, compressMonths, currentMonth, formatBasisLabel } from "@/lib/months.ts";
import { CHAINS, CHAIN_LABELS, MARKET_LABELS, type Basis, type Chain, type DcaRequest, type DcaResponse } from "@/lib/types.ts";
import { validateRequest, type FieldErrors } from "@/lib/validate.ts";

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
}

function tokenSymbol(t: { symbol: string | null; name: string | null }): string {
  // CoinGecko sometimes returns symbols like "$nmkr".
  const s = t.symbol?.replace(/^\$/, "").toUpperCase();
  return s || t.name || "tokens";
}

/** The answer in one plain sentence, so the numbers below are the evidence, not the headline. */
function ResultSentence({ amount, symbol, summary, decimals, total, shares }: { amount: number; symbol: string; summary: Summary; decimals: number; total: number; shares: boolean }) {
  if (summary.pricedMonths === 0) {
    return (
      <p className="max-w-3xl text-lg leading-snug font-bold">
        No month has a price, so there is nothing to total. Enter prices in the table to include months.
      </p>
    );
  }
  // Say "17 of 23" when some months had no price, so the number can't be read as the whole range.
  const months =
    summary.skippedMonths > 0
      ? `${summary.pricedMonths} of ${total} months`
      : `${summary.pricedMonths} ${summary.pricedMonths === 1 ? "month" : "months"}`;
  const loss = (summary.gain ?? 0) < 0;
  return (
    <p className="text-base leading-relaxed sm:text-lg">
      {fmtUsd(amount)} a month for <b>{months}</b> bought{" "}
      <b>
        {fmtNum(summary.tokens, decimals)} {shares ? `shares of ${symbol}` : symbol}
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
  );
}

/** Notes that deserve a warning flag (price is estimated, from a nearby day, or illiquid). */
const WARN_CODES = new Set(["nearest-day", "low-volume", "outlier"]);

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-1.5 [&_[data-slot=select-trigger]]:w-full [&_button]:w-full [&_input]:w-full">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-bold">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function DcaApp() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<Chain>("ethereum");
  // "stock" mode picks a tokenized stock (xStock) from a list instead of typing an address; it is always Solana.
  // "equity" is an ordinary listed stock or ETF, looked up by ticker.
  const [mode, setMode] = useState<"token" | "stock" | "equity">("token");
  const [ticker, setTicker] = useState("");
  const [tickerName, setTickerName] = useState("");
  const [reinvest, setReinvest] = useState(false);
  // The line of context shown under a ready-made check's result.
  const [exampleNote, setExampleNote] = useState<string | null>(null);
  const [stock, setStock] = useState<XStock | null>(null);
  const [amount, setAmount] = useState("500");
  // Defaults depend on the current date, so set them after mount (not during prerender).
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [formReady, setFormReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      setStartMonth((s) => s || shiftMonth(currentMonth(), -12));
      setEndMonth((e) => e || shiftMonth(currentMonth(), -1));
      setFormReady(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);
  const [basis, setBasis] = useState<Basis>("month-end");
  const [basisDay, setBasisDay] = useState(15);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [data, setData] = useState<(DcaResponse & { amount: number }) | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // The saved link plus the secret that deletes it. `edits` records the price edits it was saved with.
  const [share, setShare] = useState<{ url: string; id: string; token: string; edits: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function applyPreset(months: number) {
    const end = shiftMonth(currentMonth(), -1);
    setEndMonth(end);
    setStartMonth(shiftMonth(end, -(months - 1)));
    setErrors((e) => ({ ...e, startMonth: undefined, endMonth: undefined }));
  }

  // Bring the results into view once they arrive (they render below the fold on phones).
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!data) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [data]);

  /** Validates the form, then runs the calculation. */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const common = { amount: Number(amount), startMonth, endMonth, basis, ...(basis === "day-of-month" ? { basisDay } : {}) };
    const input: Omit<DcaRequest, "unit"> =
      mode === "equity"
        ? { address: ticker.trim(), chain: "equity", ...common, ...(reinvest ? { reinvest: true } : {}) }
        : { address: mode === "stock" ? (stock?.mint ?? "") : address, chain: mode === "stock" ? "solana" : chain, ...common };
    const errs = validateRequest(input);
    if (mode === "stock" && !stock) errs.address = "Pick a stock from the list";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setExampleNote(null);
    await execute(input);
  }

  /** Fills the form from a ready-made check and runs it straight away. */
  function runExample(ex: Example) {
    const req = exampleRequest(ex);
    if (ex.market === "equity") {
      setMode("equity");
      setTicker(ex.address);
      setTickerName(ex.label);
      setReinvest(!!ex.reinvest);
    } else {
      setMode("token");
      setChain(ex.market);
      setAddress(ex.address);
    }
    setAmount(String(ex.amount));
    setStartMonth(req.startMonth);
    setEndMonth(req.endMonth);
    setBasis(ex.basis);
    setErrors({});
    setExampleNote(ex.note ?? null);
    void execute(req);
  }

  async function execute(input: Omit<DcaRequest, "unit">) {
    setLoading(true);
    setApiError(null);
    setExportError(null);
    setShare(null);
    setShareError(null);
    try {
      const res = await fetch("/api/dca", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, address: input.address.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.fields) setErrors(j.fields);
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      setData({ ...(j as DcaResponse), amount: input.amount });
      setOverrides({});
      setDrafts({});
    } catch (err) {
      setData(null);
      setApiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const computed = useMemo(() => {
    if (!data) return null;
    const effective = data.rows.map((r) => ({ price: overrides[r.month] > 0 ? overrides[r.month] : r.price }));
    const decimals = chooseDecimals(effective, data.amount);
    const buys = buildBuys(data.rows, data.amount, data.currentPrice, overrides, decimals);
    return { buys, decimals, summary: summarize(buys, data.currentPrice) };
  }, [data, overrides]);

  // What the user is typing in a price cell. Kept apart from `overrides` so half-typed
  // text such as "0." survives; only a valid price (> 0) becomes an override.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  function editPrice(month: string, raw: string) {
    setDrafts((d) => ({ ...d, [month]: raw }));
    setOverride(month, raw);
  }
  function endEdit(month: string) {
    setDrafts((d) => {
      const next = { ...d };
      delete next[month];
      return next;
    });
  }

  function setOverride(month: string, raw: string) {
    setOverrides((o) => {
      const next = { ...o };
      const n = Number(raw);
      if (raw.trim() === "" || !(n > 0)) delete next[month];
      else next[month] = n;
      return next;
    });
  }

  async function doExport() {
    if (!data) return;
    setExporting(true);
    setExportError(null);
    const payload: ExportPayload = {
      tokenLabel: data.token.symbol?.toUpperCase() ?? data.token.name ?? "",
      chain: MARKET_LABELS[data.chain],
      address: data.address,
      basis: formatBasisLabel(data.basis, data.basisDay),
      amount: data.amount,
      currentPrice: data.currentPrice,
      currentPriceDate: data.currentPriceDate,
      rows: data.rows,
      overrides,
      sources: data.sources,
      unit: data.chain === "equity" ? "shares" : "tokens",
    };
    try {
      await downloadFile("/api/export/xlsx", payload, xlsxFileName(payload));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function doShare() {
    if (!data) return;
    setSharing(true);
    setShareError(null);
    const payload = {
      tokenLabel: data.token.symbol?.toUpperCase() ?? data.token.name ?? "",
      tokenName: data.token.name ?? "",
      chain: MARKET_LABELS[data.chain],
      address: data.address,
      basis: formatBasisLabel(data.basis, data.basisDay),
      amount: data.amount,
      currentPrice: data.currentPrice,
      currentPriceDate: data.currentPriceDate,
      rows: data.rows,
      overrides,
      sources: data.sources,
      warnings: data.warnings,
      unit: data.chain === "equity" ? "shares" : "tokens",
    };
    try {
      const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Could not save (${res.status})`);
      setShare({ url: `${window.location.origin}${j.path}`, id: j.id, token: j.deleteToken, edits: JSON.stringify(overrides) });
      setCopied(false);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Could not save this result");
    } finally {
      setSharing(false);
    }
  }

  async function copyLink() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareError("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  async function deleteLink() {
    if (!share) return;
    setShareError(null);
    try {
      const res = await fetch(`/api/share/${share.id}`, { method: "DELETE", headers: { "x-delete-token": share.token } });
      if (!res.ok && res.status !== 404) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Could not delete (${res.status})`);
      }
      setShare(null);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Could not delete this link");
    }
  }

  const shareStale = share !== null && share.edits !== JSON.stringify(overrides);

  const isEquity = data?.chain === "equity";
  const selectContent = "rounded-none border border-border bg-popover ring-0";

  const statTiles: { key: string; value: string; highlight?: boolean }[] = computed
    ? [
        { key: "Total invested", value: fmtUsd(computed.summary.invested) },
        { key: isEquity ? "Total shares" : "Total tokens", value: fmtNum(computed.summary.tokens, computed.decimals) },
        { key: "Avg buy price", value: fmtPrice(computed.summary.avgPrice) },
        { key: "Price today", value: fmtPrice(computed.summary.priceToday) },
        { key: "Value today", value: fmtUsd(computed.summary.valueToday), highlight: true },
        { key: "Gain / loss", value: fmtSigned(computed.summary.gain), highlight: true },
        { key: "Gain / loss %", value: fmtPct(computed.summary.gainPct), highlight: true },
      ]
    : [];

  return (
    <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
      {/* overflow-visible: the search dropdown has to extend past the card's bottom edge */}
      <Card className="overflow-visible rounded-none border border-border bg-card ring-0">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center border border-border bg-background leading-none">
              <Settings className="size-4 shrink-0 origin-center animate-spin-once" aria-hidden />
            </span>
            <CardTitle className="text-lg font-bold">Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {!formReady ? (
            <ParametersFormSkeleton />
          ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
              <div className="min-[480px]:col-span-full">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  value={mode}
                  onValueChange={(v) => {
                    if (!v) return;
                    const next = v as "token" | "stock" | "equity";
                    const end = endMonth || shiftMonth(currentMonth(), -1);
                    // Stocks have decades of history, tokens at most six years: move the start so the range stays valid.
                    if (next === "equity" && (!startMonth || startMonth > shiftMonth(end, -59))) setStartMonth(shiftMonth(end, -119));
                    if (next !== "equity" && startMonth && startMonth < shiftMonth(end, -71)) setStartMonth(shiftMonth(end, -11));
                    setMode(next);
                    setErrors((e) => ({ ...e, address: undefined, startMonth: undefined, endMonth: undefined }));
                  }}
                  className="form-control-h w-full sm:w-72"
                  aria-label="What to check"
                >
                  {(
                    [
                      ["token", "Token"],
                      ["stock", "xStocks"],
                      ["equity", "Stocks"],
                    ] as const
                  ).map(([v, label]) => (
                    <ToggleGroupItem
                      key={v}
                      value={v}
                      className="form-control-h flex-1 rounded-none border border-border px-2 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="min-[480px]:col-span-2">
                {mode === "equity" ? (
                  <Field id="ticker" label="Search or enter a ticker" error={errors.address}>
                    <EquitySearchInput
                      id="ticker"
                      value={ticker}
                      invalid={!!errors.address}
                      onChange={(v) => {
                        setTicker(v);
                        setTickerName("");
                      }}
                      onPick={(h) => {
                        setTicker(h.symbol);
                        setTickerName(h.name);
                        setErrors((e) => ({ ...e, address: undefined }));
                      }}
                    />
                    {tickerName && <p className="text-xs text-muted-foreground">{tickerName}</p>}
                  </Field>
                ) : mode === "stock" ? (
                  <Field id="stock" label="Stock (tokenized, on Solana)" error={errors.address}>
                    <StockPicker id="stock" value={stock} invalid={!!errors.address} onChange={(s) => (setStock(s), setErrors((e) => ({ ...e, address: undefined })))} />
                    {stock && <p className="text-xs break-all text-muted-foreground">{stock.mint}</p>}
                  </Field>
                ) : (
                  <Field id="address" label={chain === "cardano" ? "Search or paste policy ID" : "Search or paste contract address"} error={errors.address}>
                    <TokenSearchInput
                      id="address"
                      value={address}
                      onChange={setAddress}
                      chain={chain}
                      invalid={!!errors.address}
                      placeholder={chain === "cardano" ? "Token name, or a 56-character policy ID" : chain === "solana" ? "Token name, or a base58 mint address" : "Token name, or 0x..."}
                      onPick={(h) => {
                        setChain(h.chain);
                        setAddress(h.address);
                        setErrors((e) => ({ ...e, address: undefined, chain: undefined }));
                      }}
                    />
                  </Field>
                )}
              </div>
              {mode === "equity" ? (
                <Field id="reinvest" label="Dividends">
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    value={reinvest ? "reinvest" : "ignore"}
                    onValueChange={(v) => v && setReinvest(v === "reinvest")}
                    className="form-control-h w-full"
                    aria-label="Dividends"
                  >
                    {(
                      [
                        ["ignore", "Ignore"],
                        ["reinvest", "Reinvest"],
                      ] as const
                    ).map(([v, label]) => (
                      <ToggleGroupItem
                        key={v}
                        value={v}
                        className="form-control-h flex-1 rounded-none border border-border px-2 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                      >
                        {label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              ) : (
                <Field id="chain" label="Chain" error={errors.chain}>
                  <Select value={mode === "stock" ? "solana" : chain} disabled={mode === "stock"} onValueChange={(v) => setChain(v as Chain)}>
                    <SelectTrigger id="chain" className="form-control-h w-full rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={selectContent}>
                      {CHAINS.map((c) => (
                        <SelectItem key={c} value={c} className="rounded-none">
                          {CHAIN_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field id="amount" label="Monthly amount (USD)" error={errors.amount}>
                <Input
                  id="amount"
                  className="form-control-h text-sm"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={!!errors.amount}
                />
              </Field>
              <Field id="startMonth" label="Start month" error={errors.startMonth}>
                <MonthPicker id="startMonth" value={startMonth} minYear={mode === "equity" ? 1980 : undefined} max={endMonth || undefined} invalid={!!errors.startMonth} onChange={setStartMonth} />
              </Field>
              <Field id="endMonth" label="End month" error={errors.endMonth}>
                <MonthPicker id="endMonth" value={endMonth} minYear={mode === "equity" ? 1980 : undefined} min={startMonth || undefined} invalid={!!errors.endMonth} onChange={setEndMonth} />
              </Field>
              <div className="flex flex-col gap-2 min-[480px]:col-span-2">
                <Field id="basis" label="Price basis" error={errors.basis}>
                  <ToggleGroup
                    id="basis"
                    type="single"
                    variant="outline"
                    spacing={0}
                    value={basis}
                    onValueChange={(v) => {
                      if (!v) return;
                      setBasis(v as Basis);
                      setErrors((e) => ({ ...e, basis: undefined, basisDay: undefined }));
                    }}
                    className="form-control-h w-full"
                    aria-label="Price basis"
                  >
                    {(
                      [
                        ["month-end", "Month-end"],
                        ["first-of-month", "1st"],
                        ["day-of-month", "Day"],
                      ] as const
                    ).map(([v, label]) => (
                      <ToggleGroupItem
                        key={v}
                        value={v}
                        className="form-control-h flex-1 rounded-none border border-border px-2 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                      >
                        {label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
                {basis === "day-of-month" && (
                  <Field id="basisDay" label="Day of month (1–31)" error={errors.basisDay}>
                    <Select
                      value={String(basisDay)}
                      onValueChange={(v) => {
                        setBasisDay(Number(v));
                        setErrors((e) => ({ ...e, basisDay: undefined }));
                      }}
                    >
                      <SelectTrigger id="basisDay" className="form-control-h w-full rounded-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={selectContent}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={String(d)} className="rounded-none">
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Shorter months use the last day (e.g. day 31 in February uses 28, or 29 in a leap year).
                    </p>
                  </Field>
                )}
              </div>
              <div className="flex flex-col gap-3 min-[480px]:col-span-2 lg:col-span-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-muted-foreground">Quick range, ending last month</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(mode === "equity" ? [60, 120, 240] : [6, 12, 24]).map((n) => (
                      <Button key={n} type="button" variant="outline" className="form-control-h rounded-none text-sm" onClick={() => applyPreset(n)}>
                        {mode === "equity" ? `Last ${n / 12} years` : `Last ${n} months`}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  variant="default"
                  className="form-cta h-12 w-full gap-2 rounded-none border-2 border-foreground text-base font-bold tracking-wide transition-transform hover:-translate-y-px active:translate-y-0 disabled:border-border"
                >
                  {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Calculator className="size-5" aria-hidden />}
                  {loading ? "Calculating" : "Calculate DCA"}
                </Button>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-muted-foreground">Or try a ready-made check</span>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLES.map((ex) => (
                      <Button key={ex.id} type="button" variant="outline" disabled={loading} title={ex.question} className="h-9 w-auto! rounded-none px-3 text-xs sm:text-sm" onClick={() => runExample(ex)}>
                        {ex.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </form>
          )}
        </CardContent>
      </Card>

      <TokenDetails chain={mode === "stock" ? "solana" : chain} address={mode === "equity" ? "" : mode === "stock" ? (stock?.mint ?? "") : address} />

      {loading && (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Fetching prices. Rate-limit retries can take a few seconds.
          </p>
          <ResultsLoadingSkeleton />
        </div>
      )}

      {apiError && (
        <Alert variant="destructive" className="rounded-none border-border">
          <AlertTriangle />
          <AlertTitle>Couldn&apos;t load prices</AlertTitle>
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}

      {data && computed && !loading && (
        <div ref={resultsRef} className="flex scroll-mt-[calc(4.5rem+env(safe-area-inset-top))] flex-col gap-6 sm:scroll-mt-28 sm:gap-8">
          <section className="border border-border bg-card p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">{data.token.name ?? "Unknown token"}</h2>
              <Badge variant="outline" className="rounded-none font-normal">
                {MARKET_LABELS[data.chain]}
              </Badge>
              <Badge variant="outline" className="rounded-none font-normal text-muted-foreground">
                {basisBadgeLabel(data.basis, data.basisDay)}
              </Badge>
              {data.chain === "equity" && (
                <Badge variant="outline" className="rounded-none font-normal text-muted-foreground">
                  {data.reinvest ? "Dividends reinvested" : "Price only"}
                </Badge>
              )}
            </div>
            {exampleNote && <p className="mb-4 text-sm text-muted-foreground">{exampleNote}</p>}
            <div className="border-l-2 border-foreground pl-4">
              <ResultSentence
                amount={data.amount}
                symbol={tokenSymbol(data.token)}
                summary={computed.summary}
                decimals={computed.decimals}
                total={computed.buys.length}
                shares={isEquity}
              />
            </div>
          </section>

          {data.warnings.length > 0 && (
            <Alert className="rounded-none border-border">
              <AlertTriangle />
              <AlertDescription>
                {data.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-px border border-border bg-border min-[400px]:grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {statTiles.map(({ key, value, highlight }) => (
              <Card
                key={key}
                size="sm"
                className={cn(
                  "gap-1 rounded-none border-0 ring-0",
                  highlight ? "bg-secondary" : "bg-card",
                )}
              >
                <CardHeader>
                  <CardDescription className="text-xs tracking-wide uppercase">{key}</CardDescription>
                  <CardTitle className="break-all text-base font-bold tabular-nums sm:text-lg">{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <GrowthChart buys={computed.buys} priceToday={data.currentPrice} priceTodayDate={data.currentPriceDate} unit={isEquity ? "shares" : "tokens"} />

          {computed.summary.skippedMonths > 0 && (
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {computed.summary.skippedMonths} of {computed.buys.length} month(s) have no price (n/a) and are excluded from every total:{" "}
                {compressMonths(computed.summary.skipped).join(", ")}. Enter a price manually to include a month.
              </span>
            </p>
          )}

          <div className="flex flex-col gap-3 md:hidden">
            {computed.buys.map((b) => {
              const original = data.rows.find((r) => r.month === b.month)?.price ?? null;
              return (
                <article key={b.month} className="border border-border bg-card p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Month</p>
                      <p className="text-lg font-bold tabular-nums">{b.month}</p>
                    </div>
                    {b.source !== "none" && (
                      <Badge variant="outline" className="shrink-0 rounded-none">
                        {b.source}
                      </Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Price date</dt>
                      <dd className="tabular-nums">{b.priceDate ?? (b.manual ? "manual" : NA)}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs text-muted-foreground">Value today</dt>
                      <dd className="tabular-nums">{fmtUsd(b.valueToday)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="mb-1.5 text-xs text-muted-foreground">Price (USD)</dt>
                      <dd>
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`Price for ${b.month}`}
                            inputMode="decimal"
                            className="h-11 flex-1 text-right text-base tabular-nums sm:h-10 sm:text-sm"
                            placeholder={original === null ? "n/a - enter" : ""}
                            value={
                              drafts[b.month] ??
                              (overrides[b.month] !== undefined
                                ? String(overrides[b.month])
                                : original === null
                                  ? ""
                                  : fmtPrice(original).replace(/,/g, ""))
                            }
                            onChange={(e) => editPrice(b.month, e.target.value)}
                            onBlur={() => endEdit(b.month)}
                          />
                          {b.manual && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-11 shrink-0 rounded-none sm:size-9"
                              title="Reset to fetched price"
                              aria-label={`Reset ${b.month}`}
                              onClick={() => {
                                setOverride(b.month, "");
                                endEdit(b.month);
                              }}
                            >
                              <X />
                            </Button>
                          )}
                        </div>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Amount (USD)</dt>
                      <dd className="tabular-nums">{b.tokens === null ? NA : fmtNum(b.amount, 2)}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs text-muted-foreground">{isEquity ? "Shares" : "Tokens"}</dt>
                      <dd className="tabular-nums">{fmtNum(b.tokens, computed.decimals)}</dd>
                    </div>
                  </dl>
                  {b.notes.length > 0 && (
                    <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                      {b.notes.map((n) => (
                        <li key={n.code + n.text} className="flex items-start gap-1.5">
                          {WARN_CODES.has(n.code) && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-label="warning" />}
                          <span>{n.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto border border-border bg-background/80 backdrop-blur-xl md:block">
            <p className="sr-only">Monthly buy breakdown table</p>
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  {(["Month", "Price date", "Price (USD)", "Amount (USD)", isEquity ? "Shares bought" : "Tokens bought", "Value today (USD)", "Source", "Note"] as const).map((h, i) => (
                    <TableHead key={h} className={cn("text-sm text-muted-foreground", i >= 2 && i <= 5 && "text-right")}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.buys.map((b) => {
                  const original = data.rows.find((r) => r.month === b.month)?.price ?? null;
                  return (
                    <TableRow key={b.month} className="align-top odd:bg-muted/40 hover:bg-muted/60">
                      <TableCell>{b.month}</TableCell>
                      <TableCell>{b.priceDate ?? (b.manual ? "manual" : NA)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            aria-label={`Price for ${b.month}`}
                            inputMode="decimal"
                            className="h-8 w-32 text-right tabular-nums"
                            placeholder={original === null ? "n/a - enter" : ""}
                            value={
                              drafts[b.month] ??
                              (overrides[b.month] !== undefined ? String(overrides[b.month]) : original === null ? "" : fmtPrice(original).replace(/,/g, ""))
                            }
                            onChange={(e) => editPrice(b.month, e.target.value)}
                            onBlur={() => endEdit(b.month)}
                          />
                          {b.manual && (
                            <Button type="button" variant="outline" size="icon-sm" title="Reset to fetched price" aria-label={`Reset ${b.month}`} onClick={() => { setOverride(b.month, ""); endEdit(b.month); }}>
                              <X />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{b.tokens === null ? NA : fmtNum(b.amount, 2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(b.tokens, computed.decimals)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtUsd(b.valueToday)}</TableCell>
                      <TableCell>
                        {b.source === "none" ? NA : <Badge variant="outline" className="rounded-none">{b.source}</Badge>}
                      </TableCell>
                      <TableCell className="whitespace-normal text-xs">
                        {b.notes.map((n) => (
                          <div key={n.code + n.text} className="flex items-start gap-1">
                            {WARN_CODES.has(n.code) && <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-label="warning" />}
                            <span>{n.text}</span>
                          </div>
                        ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Download results for accounting or offline review.</p>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-none transition-transform hover:-translate-y-px active:translate-y-0 sm:h-10 sm:w-auto"
              onClick={() => doExport()}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              {exporting ? "Building XLSX" : "Export spreadsheet"}
            </Button>
          </div>
          {exportError && (
            <Alert variant="destructive" className="rounded-none border-border">
              <AlertTriangle />
              <AlertTitle>Export failed</AlertTitle>
              <AlertDescription>{exportError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Save this result and get a public link. Anyone with the link can see it, but not change it.
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-none transition-transform hover:-translate-y-px active:translate-y-0 sm:h-10 sm:w-auto"
                onClick={() => doShare()}
                disabled={sharing}
              >
                {sharing ? <Loader2 className="animate-spin" /> : <Share2 />}
                {sharing ? "Saving" : share ? "Share again" : "Share"}
              </Button>
            </div>
            {share && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly aria-label="Public link" value={share.url} className="h-11 text-base sm:h-10 sm:text-sm" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" variant="outline" className="h-11 rounded-none sm:h-10" onClick={() => copyLink()}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button type="button" variant="outline" className="h-11 rounded-none sm:h-10" onClick={() => deleteLink()}>
                    <Trash2 />
                    Delete link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {shareStale
                    ? "You changed prices after saving. This link still shows the earlier version. Share again makes a new link and leaves this one up."
                    : "You can delete this link here until you leave or recalculate. After that it stays up."}
                </p>
              </div>
            )}
            {shareError && (
              <p role="alert" className="flex items-center gap-1.5 text-sm font-bold">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                {shareError}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Prices are daily points (UTC) from {data.sources.map((s) => s.label).join(", ") || "the data provider"}.
          </p>
        </div>
      )}
    </div>
  );
}
