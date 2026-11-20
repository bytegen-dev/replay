"use client";

import { SourceBadge } from "@/components/SourceBadge";
import Link from "next/link";
import { ChainLogo, CoinLogo } from "@/components/ChainLogo";
import { StockLogo } from "@/components/StockLogo";
import { AlertTriangle, Check, ChevronDown, Copy, FileSpreadsheet, History, Settings, Share2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import { ParametersFormSkeleton, ResultsLoadingSkeleton } from "@/components/DcaSkeletons";
import { MonthPicker, formatMonth } from "@/components/MonthPicker";
import { EquitySearchInput } from "@/components/EquitySearch";
import { GrowthChart } from "@/components/GrowthChart";
import { InsightsCard } from "@/components/InsightsCard";
import { FxPanel } from "@/components/FxPanel";
import { MonthFilterBar } from "@/components/MonthFilterBar";
import { AmountInput } from "@/components/AmountInput";
import { CoinPicker } from "@/components/CoinPicker";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { currencyByCode, isCurrency } from "@/lib/fxCurrencies.ts";
import { getTiingoKey } from "@/lib/userKeys.ts";
import { countBuys, DEFAULT_PLAN, isPlan, PLANS, planInfo, type Plan } from "@/lib/plan.ts";
import { cleanAmount, formatAmountInput, parseAmount, decodeRange, encodeRange, readQuery, writeQuery } from "@/lib/urlState.ts";
import { RollText } from "@/components/RollText";
import { applyMonthFilters, NO_FILTER, type MonthFilter } from "@/lib/monthFilters.ts";
import { motionReduced } from "@/lib/settings.ts";
import { TokenDetails } from "@/components/TokenDetails";
import { TokenSearchInput } from "@/components/TokenSearch";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadFile } from "@/lib/download.ts";
import { EXAMPLES, exampleRequest, type Example } from "@/lib/examples.ts";
import { exampleSnapshot } from "@/lib/exampleResults.ts";
import { DEFAULT_FUNDING_APR, DEFAULT_LEVERAGE, liquidationDropPct, MAX_LEVERAGE } from "@/lib/leverage.ts";
import { LeverageCard } from "@/components/LeverageCard";
import { xlsxFileName, type ExportPayload } from "@/lib/exportData.ts";
import { fmtNum, fmtPct, fmtPrice, fmtSigned, fmtUsd, NA } from "@/lib/format.ts";
import { buildBuys, chooseDecimals, summarize, type Overrides, type Summary } from "@/lib/math.ts";
import { basisBadgeLabel, compressMonths, currentMonth, formatBasisLabel, isMonth, monthsBetween } from "@/lib/months.ts";
import { CHAINS, CHAIN_LABELS, type Basis, type Chain, type DcaRequest, type DcaResponse } from "@/lib/types.ts";
import { MAJORS, isMajorSymbol, marketLabel } from "@/lib/majors.ts";
import { validateRequest, type FieldErrors } from "@/lib/validate.ts";

/** What the Hindsight form opens with. */
const START_PLAN: Plan = "once";

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
}

function tokenSymbol(t: { symbol: string | null; name: string | null }): string {
  // CoinGecko sometimes returns symbols like "$pepe".
  const s = t.symbol?.replace(/^\$/, "").toUpperCase();
  return s || t.name || "tokens";
}

/** The answer in one plain sentence, so the numbers below are the evidence, not the headline. */
function ResultSentence({ amount, symbol, summary, decimals, total, shares, currency, sold, plan }: { plan?: Plan; amount: number; symbol: string; summary: Summary; decimals: number; total: number; shares: boolean; currency?: DcaResponse["currency"]; sold?: boolean }) {
  if (summary.pricedMonths === 0) {
    return (
      <p className="max-w-3xl text-lg leading-snug font-bold">
        No month has a price, so there is nothing to total. Enter prices in the table to include months.
      </p>
    );
  }
  // Say "17 of 23" when some months had no price, so the number can't be read as the whole range.
  const unitWord = plan && plan !== "monthly" ? "buy" : "month";
  const months =
    summary.skippedMonths > 0
      ? `${summary.pricedMonths} of ${total} ${unitWord}s`
      : `${summary.pricedMonths} ${summary.pricedMonths === 1 ? unitWord : `${unitWord}s`}`;
  const loss = (summary.gain ?? 0) < 0;
  // When the amount is in another currency, say it in that currency, then add what it all came to in that currency too.
  const local = (n: number) => `${currency!.symbol}${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;
  const putInLocal = currency ? amount * summary.pricedMonths : null;
  const worthLocal = currency && currency.perUsdToday !== null && summary.valueToday !== null ? summary.valueToday * currency.perUsdToday : null;
  return (
    <>
      <p className="text-base leading-relaxed sm:text-lg">
        {currency ? local(amount) : fmtUsd(amount)} {planInfo(plan).phrase}
        {plan !== "once" && (
          <>
            {" "}
            for <b>{months}</b>
          </>
        )}{" "}
        bought{" "}
        <b>
          {fmtNum(summary.tokens, decimals)} {shares ? `shares of ${symbol}` : symbol}
        </b>{" "}
        for <b>{fmtUsd(summary.invested)}</b>.
        {summary.valueToday !== null && summary.gain !== null && (
          <>
            {" "}
            {sold ? "Sold at the end month, that is worth" : "Today that is worth"} <b>{fmtUsd(summary.valueToday)}</b>, a {loss ? "loss" : "gain"} of{" "}
            <b>{fmtUsd(Math.abs(summary.gain))}</b> ({fmtPct(summary.gainPct)}).
          </>
        )}
      </p>
      {currency && putInLocal !== null && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          In {currency.name}: you put in <b className="text-foreground">{local(putInLocal)}</b>
          {worthLocal !== null && (
            <>
              {" "}
              and it is worth about <b className="text-foreground">{local(worthLocal)}</b> {sold ? "at sale" : "today"} at {currency.perUsdToday!.toLocaleString("en-US", { maximumFractionDigits: 2 })} {currency.code} to the dollar ({fmtPct(((worthLocal - putInLocal) / putInLocal) * 100)}).
            </>
          )}
          {worthLocal === null && "."}
        </p>
      )}
    </>
  );
}

/** Notes that deserve a warning flag (price is estimated, from a nearby day, or illiquid). */
const WARN_CODES = new Set(["nearest-day", "low-volume", "outlier"]);

function Field({ id, label, error, children, className }: { id: string; label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full flex-col gap-1.5 [&_[data-slot=select-trigger]]:w-full [&_button]:w-full [&_input]:w-full", className)}>
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
  // "equity" is an ordinary listed stock or ETF, looked up by ticker. It is the default; "token" is an on-chain token.
  const [mode, setMode] = useState<"token" | "equity" | "fx">("equity");
  // Inside Crypto: a major coin picked from a short list (long history), or any token by address (pool history).
  const [cryptoKind, setCryptoKind] = useState<"major" | "token">("major");
  const [major, setMajor] = useState("BTC-USD");
  const isMajor = mode === "token" && cryptoKind === "major";
  const usesYahoo = mode === "equity" || isMajor;
  const [ticker, setTicker] = useState("");
  const [tickerName, setTickerName] = useState("");
  const [reinvest, setReinvest] = useState(false);
  // The line of context shown under a ready-made check's result.
  const [exampleNote, setExampleNote] = useState<string | null>(null);
  const [amount, setAmount] = useState("500");
  // "Sell at end month": value the holding at the end month's price instead of today's. Applied when the check runs.
  const [sellAtEnd, setSellAtEnd] = useState(false);
  // How often the amount is bought: every month, every 3 or 6 months, yearly, or once at the start month.
  // The form starts on a single buy at the start month. (The API's own default stays "monthly"; only what the page opens with changes.)
  const [plan, setPlan] = useState<Plan>(START_PLAN);
  // Leverage, futures style. 1 means plain buying. The other settings only matter above 1x.
  const [lev, setLev] = useState("1");
  const [side, setSide] = useState<"long" | "short">("long");
  const [fundingApr, setFundingApr] = useState(String(DEFAULT_FUNDING_APR));
  const [topUp, setTopUp] = useState(false);
  const [topUpMax, setTopUpMax] = useState("");
  const [topUpBudget, setTopUpBudget] = useState("");
  const [maxLoss, setMaxLoss] = useState("");
  const [stopUnit, setStopUnit] = useState<"%" | "$">("%");
  // The funding, top-up and max-loss settings are details: shown when asked for (or when a link already changed them).
  const [levMore, setLevMore] = useState(false);
  // With leverage on, the plain (unleveraged) result is secondary: shown only when asked for.
  const [plainOpen, setPlainOpen] = useState(false);
  const levNum = Number(lev);
  const leveraged = Number.isFinite(levNum) && levNum > 1;
  // Prices come from the data source and are read-only unless the person switches editing on (for what-if prices, or to fill a gap).
  const [editPrices, setEditPrices] = useState(false);
  // Switching tab clears the results, so a switch with results nobody has exported or shared asks first. These track that.
  const [exported, setExported] = useState(false);
  const [fxHasResult, setFxHasResult] = useState(false);
  // What the user is typing in a price cell. Kept apart from `overrides` so half-typed
  // text such as "0." survives; only a valid price (> 0) becomes an override.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingMode, setPendingMode] = useState<"token" | "equity" | "fx" | null>(null);
  // The currency the monthly amount is in. Each buy is converted to dollars at that day's rate.
  const [currency, setCurrency] = useState("USD");
  // Defaults depend on the current date, so set them after mount (not during prerender).
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [basis, setBasis] = useState<Basis>("month-end");
  const [basisDay, setBasisDay] = useState(15);
  const [formReady, setFormReady] = useState(false);
  // A link with run=1 (the footer timeline makes them) fills the form and runs it once the form is ready.
  const autoRun = useRef(false);
  // Which months the list below the result shows (the totals always use every month).
  const [monthFilter, setMonthFilter] = useState<MonthFilter>(NO_FILTER);
  // The first day the chosen asset has a price. Months before it can't be picked.
  const [yahooLaunch, setYahooLaunch] = useState<string | null>(null);
  const [tokenLaunch, setTokenLaunch] = useState<string | null>(null);
  // A major coin's first price date is known up front, so earlier months can't be picked even before (or without) any lookup.
  const majorFirst = isMajor ? (MAJORS.find((m) => m.symbol === major)?.firstPrice ?? null) : null;
  const launchDate = isMajor ? majorFirst : usesYahoo ? yahooLaunch : tokenLaunch;
  const launchMonth = launchDate ? launchDate.slice(0, 7) : undefined;
  // A start month from before the asset existed moves up to its first month.
  const onTokenLaunch = useCallback((d: string | null) => {
    setTokenLaunch(d);
    if (d) setStartMonth((s) => (s && s < d.slice(0, 7) ? d.slice(0, 7) : s));
  }, []);
  // Picking a coin (or arriving by link) with a start month from before it existed moves the start up to its first month.
  useEffect(() => {
    if (!majorFirst) return;
    const id = setTimeout(() => setStartMonth((s) => (s && s < majorFirst.slice(0, 7) ? majorFirst.slice(0, 7) : s)), 0);
    return () => clearTimeout(id);
  }, [majorFirst]);
  const clampStart = (m: string) => (launchMonth && m < launchMonth ? launchMonth : m);
  useEffect(() => {
    const id = setTimeout(() => {
      // What the address bar remembers: the tab, the asset, the amount, the range. Restored before the form shows, so it never flashes the defaults.
      const q = readQuery();
      const last = shiftMonth(currentMonth(), -1);
      const tab = q.get("tab");
      if (tab === "fx") setMode("fx");
      else if (tab === "crypto") {
        setMode("token");
        const kind = q.get("kind") === "token" ? "token" : "major";
        setCryptoKind(kind);
        const coin = q.get("coin")?.toUpperCase();
        if (coin && isMajorSymbol(coin)) setMajor(coin);
        const ch = q.get("chain");
        if (ch && (CHAINS as readonly string[]).includes(ch)) setChain(ch as Chain);
        const addr = q.get("a");
        if (addr && /^[A-Za-z0-9]{20,100}$/.test(addr)) setAddress(addr);
      } else if (tab === "stocks") {
        const t = q.get("s")?.toUpperCase();
        if (t && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)) setTicker(t);
        if (q.get("drip") === "1") setReinvest(true);
      }
      if (q.get("run") === "1") autoRun.current = true;
      if (q.get("sell") === "1") setSellAtEnd(true);
      const pl = q.get("plan");
      if (isPlan(pl)) setPlan(pl);
      const lv = Number(q.get("lev"));
      if (Number.isFinite(lv) && lv > 1 && lv <= MAX_LEVERAGE) {
        setLev(String(lv));
        if (q.get("side") === "short") setSide("short");
        const fa = q.get("fund");
        if (fa !== null && Number.isFinite(Number(fa)) && Number(fa) >= 0 && Number(fa) <= 500) setFundingApr(fa);
        if (q.get("topup") === "1") setTopUp(true);
        if (fa !== null || q.get("topup") === "1" || q.get("topmax") || q.get("topbudget") || q.get("maxloss") || q.get("maxlosspct")) setLevMore(true);
        const tb = cleanAmount(q.get("topbudget"));
        if (tb) setTopUpBudget(tb);
        const tm = cleanAmount(q.get("topmax"));
        if (tm) setTopUpMax(tm);
        const ml = cleanAmount(q.get("maxloss"));
        const mp = cleanAmount(q.get("maxlosspct"));
        if (mp) {
          setMaxLoss(mp);
          setStopUnit("%");
        } else if (ml) {
          setMaxLoss(ml);
          setStopUnit("$");
        }
      }
      const a = cleanAmount(q.get("amt"));
      if (a) setAmount(formatAmountInput(a));
      const cur = q.get("cur")?.toUpperCase();
      if (cur && isCurrency(cur)) setCurrency(cur);
      const b = q.get("basis");
      if (b === "first-of-month" || b === "day-of-month" || b === "month-end") setBasis(b);
      const day = Number(q.get("day"));
      if (Number.isInteger(day) && day >= 1 && day <= 31) setBasisDay(day);
      const r = decodeRange(q, last);
      if (r) {
        setStartMonth(r.start);
        setEndMonth(r.end);
      }
      setStartMonth((s) => s || shiftMonth(currentMonth(), -120));
      setEndMonth((e) => e || last);
      setFormReady(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);
  // Stocks and major coins: ask when this ticker first traded, once it has stopped changing.
  const yahooSymbol = isMajor ? major : mode === "equity" ? ticker.trim().toUpperCase() : "";
  useEffect(() => {
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(yahooSymbol)) {
      const id = setTimeout(() => setYahooLaunch(null), 0);
      return () => clearTimeout(id);
    }
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/asset-start?symbol=${encodeURIComponent(yahooSymbol)}`, { signal: controller.signal });
        const j = await r.json().catch(() => null);
        const first = r.ok && typeof j?.firstDate === "string" ? (j.firstDate as string) : null;
        setYahooLaunch(first);
        // Major coins use their fixed first-price date instead, which doesn't depend on which source answered.
        if (first && !isMajorSymbol(yahooSymbol)) setStartMonth((s) => (s && s < first.slice(0, 7) ? first.slice(0, 7) : s));
      } catch {
        /* an aborted or failed lookup just leaves the form unrestricted */
      }
    }, 500);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [yahooSymbol]);

  // Keep the address bar in step with the form (the Currencies tab does this for itself), so a reload or a copied link restores it.
  useEffect(() => {
    if (!formReady || mode === "fx") return;
    const last = shiftMonth(currentMonth(), -1);
    writeQuery({
      tab: mode === "equity" ? "stocks" : "crypto",
      ...(mode === "equity"
        ? { s: ticker.trim().toUpperCase(), drip: reinvest && !leveraged && "1" }
        : cryptoKind === "major"
          ? { coin: major }
          : { kind: "token", chain, a: address.trim() }),
      amt: cleanAmount(amount) ?? undefined,
      cur: currency !== "USD" && currency,
      ...encodeRange(startMonth, endMonth, last),
      basis: basis !== "month-end" && basis,
      day: basis === "day-of-month" && String(basisDay),
      sell: sellAtEnd && "1",
      plan: plan !== START_PLAN && plan,
      lev: leveraged && String(levNum),
      side: leveraged && side === "short" && "short",
      fund: leveraged && fundingApr !== String(DEFAULT_FUNDING_APR) && fundingApr,
      topup: leveraged && topUp && "1",
      topmax: leveraged && topUp && cleanAmount(topUpMax),
      topbudget: leveraged && topUp && cleanAmount(topUpBudget),
      maxloss: leveraged && stopUnit === "$" && cleanAmount(maxLoss),
      maxlosspct: leveraged && stopUnit === "%" && cleanAmount(maxLoss),
    });
  }, [formReady, mode, ticker, reinvest, cryptoKind, major, chain, address, amount, currency, startMonth, endMonth, basis, basisDay, sellAtEnd, plan, leveraged, levNum, fundingApr, topUp, topUpMax, topUpBudget, maxLoss, stopUnit, side]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [data, setData] = useState<(DcaResponse & { amount: number; sold?: boolean; plan?: Plan }) | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // The saved link plus the secret that deletes it. `edits` records the price edits it was saved with.
  const [share, setShare] = useState<{ url: string; id: string; token: string; edits: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // A sentence describing exactly what pressing the button will run, so the form can be checked at a glance.
  const assetName = isMajor ? (MAJORS.find((m) => m.symbol === major)?.name ?? major) : mode === "equity" ? ticker.trim().toUpperCase() : address.trim() ? "this token" : "";
  const amountNum = parseAmount(amount);
  // Whole dollars (fmtUsd always shows cents and throws if asked for none).
  // In the currency picked beside the amount (naira shows ₦, euros €), not always dollars.
  const usd0 = (n: number) => `${currencyByCode(currency)?.symbol ?? "$"}${n.toLocaleString("en-US", { maximumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;
  const runMonths = isMonth(startMonth) && isMonth(endMonth) && startMonth <= endMonth ? monthsBetween(startMonth, endMonth).length : 0;
  const runSummary = !assetName
    ? mode === "equity"
      ? "Choose a stock or ETF to check."
      : "Choose a coin or paste a token address to check."
    : !(amountNum > 0)
      ? "Enter how much you buy each month."
      : runMonths === 0
        ? "Pick a start month that comes before the end month."
        : plan === "once"
          ? `${usd0(amountNum)} once into ${assetName} in ${formatMonth(startMonth)}, valued at ${sellAtEnd ? formatMonth(endMonth) : "today's price"}.`
          : `${usd0(amountNum)} ${PLANS.find((p) => p.value === plan)?.phrase} into ${assetName}, ${formatMonth(startMonth)} to ${formatMonth(endMonth)}: ${countBuys(plan, startMonth, endMonth)} ${countBuys(plan, startMonth, endMonth) === 1 ? "buy" : "buys"}, ${usd0(amountNum * countBuys(plan, startMonth, endMonth))} in all.`;

  // The Stocks / Crypto / Currencies switch (and the Majors / Other tokens filter under Crypto). Shared by the form and the Currencies tab.
  /** Moves to another tab and clears the results, which belong to the tab they were made on. */
  function switchMode(next: "token" | "equity" | "fx") {
    const end = endMonth || shiftMonth(currentMonth(), -1);
    const longHistory = next === "equity" || cryptoKind === "major";
    // Stocks have decades of history, tokens at most six years: move the start so the range stays valid.
    if (next !== "fx") {
      if (longHistory && (!startMonth || startMonth > shiftMonth(end, -59))) setStartMonth(shiftMonth(end, -119));
      if (!longHistory && startMonth && startMonth < shiftMonth(end, -71)) setStartMonth(shiftMonth(end, -11));
    }
    setMode(next);
    setData(null);
    setOverrides({});
    setDrafts({});
    setShare(null);
    setShareError(null);
    setExportError(null);
    setExported(false);
    setFxHasResult(false);
    setExampleNote(null);
    setMonthFilter(NO_FILTER);
    setApiError(null);
    setErrors((e) => ({ ...e, address: undefined, startMonth: undefined, endMonth: undefined }));
  }

  // The Stocks / Crypto / Currencies tabs sit in the card header. Majors / Other tokens (under Crypto) stays with the form.
  const modeTabs = (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  value={mode}
                  onValueChange={(v) => {
                    if (!v) return;
                    const next = v as "token" | "equity" | "fx";
                    if (next === mode) return;
                    // Results that have been neither exported nor shared would be lost: ask first.
                    if ((data !== null && !exported && !share) || (mode === "fx" && fxHasResult)) {
                      setPendingMode(next);
                      return;
                    }
                    switchMode(next);
                  }}
                  className="form-control-h w-full sm:w-96"
                  aria-label="What to check"
                >
                  {(
                    [
                      ["equity", "Stocks"],
                      ["token", "Crypto"],
                      ["fx", "Currencies"],
                    ] as const
                  ).map(([v, label]) => (
                    <ToggleGroupItem
                      key={v}
                      value={v}
                      className={cn("form-control-h flex-1 rounded-none border border-border px-2 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground", v === "equity" && "cut-tab-first", v === "fx" && "cut-tab-last")}
                    >
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
  );
  const kindRow = (
    <>
                {mode === "token" && (
                  <div role="group" aria-label="Kind of crypto" className="flex gap-4 text-sm min-[480px]:col-span-full">
                    {(
                      [
                        ["major", "Majors"],
                        ["token", "Other tokens"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={cryptoKind === v}
                        onClick={() => {
                          const end = endMonth || shiftMonth(currentMonth(), -1);
                          if (v === "major" && (!startMonth || startMonth > shiftMonth(end, -35))) setStartMonth(shiftMonth(end, -59));
                          if (v === "token" && startMonth && startMonth < shiftMonth(end, -71)) setStartMonth(shiftMonth(end, -11));
                          setCryptoKind(v);
                          setApiError(null);
                          setErrors((e) => ({ ...e, address: undefined, startMonth: undefined, endMonth: undefined }));
                        }}
                        className={cn("underline-offset-4", cryptoKind === v ? "font-bold underline decoration-2" : "text-muted-foreground hover:text-foreground hover:underline")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
    </>
  );

  function applyPreset(months: number) {
    const end = shiftMonth(currentMonth(), -1);
    setEndMonth(end);
    setStartMonth(clampStart(shiftMonth(end, -(months - 1))));
    setErrors((e) => ({ ...e, startMonth: undefined, endMonth: undefined }));
  }

  // Bring the results into view once they arrive (they render below the fold on phones).
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!data) return;
    const reduce = motionReduced();
    resultsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [data]);

  /** Validates the form, then runs the calculation. */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const common = { amount: parseAmount(amount), ...(currency !== "USD" ? { currency } : {}), ...(plan !== DEFAULT_PLAN ? { plan } : {}), ...(leveraged ? { leverage: { leverage: levNum, ...(side === "short" ? { side: "short" as const } : {}), fundingApr: Number(fundingApr), ...(topUp ? { topUp: true } : {}), ...(topUp && parseAmount(topUpMax) > 0 ? { topUpMax: parseAmount(topUpMax) } : {}), ...(topUp && parseAmount(topUpBudget) > 0 ? { topUpBudget: parseAmount(topUpBudget) } : {}), ...(parseAmount(maxLoss) > 0 ? (stopUnit === "%" ? { maxLossPct: parseAmount(maxLoss) } : { maxLoss: parseAmount(maxLoss) }) : {}) }, ...(sellAtEnd ? { sellAtEnd: true } : {}) } : {}), startMonth, endMonth, basis, ...(basis === "day-of-month" ? { basisDay } : {}) };
    const input: Omit<DcaRequest, "unit"> =
      usesYahoo
        ? { address: isMajor ? major : ticker.trim(), chain: "equity", ...common, ...(reinvest && !isMajor && !leveraged ? { reinvest: true } : {}) }
        : { address, chain, ...common };
    const errs = validateRequest(input);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setExampleNote(null);
    await execute(input);
  }

  /**
   * Fills the form from a ready-made check and shows its result. A result worked out ahead of time appears at once (marked with its
   * date) while live prices are fetched in the background and replace it; without one, the check just runs.
   */
  function runExample(ex: Example) {
    const req = exampleRequest(ex);
    if (isMajorSymbol(ex.address)) {
      setMode("token");
      setCryptoKind("major");
      setMajor(ex.address);
    } else if (ex.market === "equity") {
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
    setPlan(ex.plan ?? "monthly");
    setLev("1");
    setSide("long");
    setSellAtEnd(false);
    setCurrency("USD");
    setErrors({});
    const snap = exampleSnapshot(ex.id);
    if (snap) {
      const ran = req.plan ?? DEFAULT_PLAN;
      setData({ ...snap.response, amount: ex.amount, ...(ran !== DEFAULT_PLAN ? { plan: ran } : {}) });
      setMonthFilter({ ...NO_FILTER, onlyBought: ran !== DEFAULT_PLAN });
      setOverrides({});
      setDrafts({});
      setShare(null);
      setExported(false);
      setApiError(null);
      setExampleNote(`${ex.note ?? ""} Saved result from ${snap.asOf}. Checking live prices.`.trim());
      void execute(req, false, { note: ex.note ?? null });
    } else {
      setExampleNote(ex.note ?? null);
      void execute(req, false);
    }
  }

  async function execute(input: Omit<DcaRequest, "unit">, sold: boolean = sellAtEnd, refresh?: { note: string | null }) {
    // A refresh replaces a saved result quietly: no loading state, and if it fails the saved result stays.
    if (!refresh) {
      setLoading(true);
      setApiError(null);
      setExportError(null);
      setShare(null);
      setShareError(null);
    }
    try {
      const res = await fetch("/api/dca", {
        method: "POST",
        // Stocks only: a key from Settings lets the server fall back to Tiingo when Yahoo refuses.
        headers: { "content-type": "application/json", ...(input.chain === "equity" && getTiingoKey() ? { "x-tiingo-key": getTiingoKey()! } : {}) },
        body: JSON.stringify({ ...input, address: input.address.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.fields) setErrors(j.fields);
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      // What ran comes from the request itself, so a ready-made check (always monthly) isn't labelled with the form's plan.
      const ran = input.plan ?? DEFAULT_PLAN;
      setData({ ...(j as DcaResponse), amount: input.amount, ...(sold ? { sold: true } : {}), ...(ran !== DEFAULT_PLAN ? { plan: ran } : {}) });
      setExported(false);
      // Under a plan that buys only some months, start with the list showing just those; one click shows every month.
      setMonthFilter({ ...NO_FILTER, onlyBought: ran !== DEFAULT_PLAN });
      setOverrides({});
      setDrafts({});
      if (refresh) setExampleNote(refresh.note);
    } catch (err) {
      if (refresh) {
        setExampleNote((n) => `${(n ?? "").replace(/ Checking live prices\.$/, "")} Live prices could not be loaded, so this is the saved result.`.trim());
        return;
      }
      setData(null);
      setApiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (!refresh) setLoading(false);
    }
  }

  useEffect(() => {
    if (!formReady || !autoRun.current || mode === "fx") return;
    autoRun.current = false;
    void submit({ preventDefault() {} } as React.FormEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formReady]);

  // The price the holding is valued at: today's, or the end month's last priced row when it is sold there.
  const val = useMemo(() => {
    if (!data) return null;
    if (!data.sold) return { price: data.currentPrice, date: data.currentPriceDate, sold: false, perUsd: data.currency?.perUsdToday ?? null };
    const last = [...data.rows].reverse().find((r) => (overrides[r.month] > 0 ? overrides[r.month] : r.price) !== null);
    if (!last) return { price: data.currentPrice, date: data.currentPriceDate, sold: true, perUsd: null };
    return { price: overrides[last.month] > 0 ? overrides[last.month] : last.price, date: last.priceDate ?? last.targetDate, sold: true, perUsd: last.fx ?? null };
  }, [data, overrides]);

  const computed = useMemo(() => {
    if (!data || !val) return null;
    const effective = data.rows.map((r) => ({ price: overrides[r.month] > 0 ? overrides[r.month] : r.price, fx: r.fx }));
    const decimals = chooseDecimals(effective, data.amount);
    const buys = buildBuys(data.rows, data.amount, val.price, overrides, decimals, data.plan);
    return { buys, decimals, summary: summarize(buys, val.price) };
  }, [data, val, overrides]);
  // The word used beside the final valuation.
  const when = val?.sold ? "at sale" : "today";

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
      chain: marketLabel(data.chain, data.address),
      address: data.address,
      basis: formatBasisLabel(data.basis, data.basisDay),
      amount: data.amount,
      currentPrice: val ? val.price : data.currentPrice,
      currentPriceDate: val ? val.date : data.currentPriceDate,
      rows: data.rows,
      overrides,
      sources: data.sources,
      unit: isEquity ? "shares" : "tokens",
      ...(data.sold ? { sold: true } : {}),
      ...(data.plan ? { plan: data.plan } : {}),
      ...(data.currency ? { currency: { code: data.currency.code, symbol: data.currency.symbol, perUsdToday: data.currency.perUsdToday } } : {}),
    };
    try {
      await downloadFile("/api/export/xlsx", payload, xlsxFileName(payload));
      setExported(true);
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
      chain: marketLabel(data.chain, data.address),
      address: data.address,
      basis: formatBasisLabel(data.basis, data.basisDay),
      amount: data.amount,
      currentPrice: val ? val.price : data.currentPrice,
      currentPriceDate: val ? val.date : data.currentPriceDate,
      rows: data.rows,
      overrides,
      sources: data.sources,
      warnings: data.warnings,
      unit: isEquity ? "shares" : "tokens",
      ...(data.sold ? { sold: true } : {}),
      ...(data.plan ? { plan: data.plan } : {}),
      ...(data.leverage ? { leverage: data.leverage } : {}),
      ...(data.currency ? { currency: { code: data.currency.code, symbol: data.currency.symbol, perUsdToday: data.currency.perUsdToday } } : {}),
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

  const isEquity = data?.chain === "equity" && !isMajorSymbol(data.address);
  // The months the list shows after filtering and ordering. Totals, charts and exports still use every month.
  const shownBuys = useMemo(() => (computed ? applyMonthFilters(computed.buys, monthFilter) : []), [computed, monthFilter]);
  // Inside the open list only the ticked item keeps its colour; the others go grey. The value shown on the closed select is coloured.
  const selectContent = "rounded-none border border-border bg-popover ring-0 [&_[data-slot=select-item]:not([data-state=checked])_.chain-logo]:grayscale [&_[data-slot=select-item]:not([data-state=checked])_.chain-logo]:opacity-70";

  const statTiles: { key: string; value: string; highlight?: boolean }[] = computed
    ? [
        { key: "Total invested", value: fmtUsd(computed.summary.invested) },
        { key: isEquity ? "Total shares" : "Total tokens", value: fmtNum(computed.summary.tokens, computed.decimals) },
        { key: "Avg buy price", value: fmtPrice(computed.summary.avgPrice) },
        { key: `Price ${when}`, value: fmtPrice(computed.summary.priceToday) },
        { key: `Value ${when}`, value: fmtUsd(computed.summary.valueToday), highlight: true },
        { key: "Gain / loss", value: fmtSigned(computed.summary.gain), highlight: true },
        { key: "Gain / loss %", value: fmtPct(computed.summary.gainPct), highlight: true },
      ]
    : [];

  // Pieces of the result that sit in a different place when leverage is on.
  const assetHeader =
    data && computed ? (
    <div className="flex flex-wrap items-center gap-2">
      {/* The asset's logo: the company for a stock or ETF, the coin for a major. */}
      {data.chain === "equity" && (isMajorSymbol(data.address) ? <CoinLogo symbol={data.address} className="size-8 shrink-0" /> : <StockLogo symbol={data.address} className="size-8 text-sm" />)}
      <h2 className="text-xl font-bold tracking-tight">{data.token.name ?? "Unknown token"}</h2>
      <Badge variant="outline" className="gap-1.5 rounded-none font-normal">
        {isMajorSymbol(data.address) ? <CoinLogo symbol={data.address} className="size-3.5 shrink-0" /> : <ChainLogo chain={data.chain} className="size-3.5 shrink-0" />}
        {marketLabel(data.chain, data.address)}
      </Badge>
      <Badge variant="outline" className="rounded-none font-normal text-muted-foreground">
        {basisBadgeLabel(data.basis, data.basisDay)}
      </Badge>
      {data.chain === "equity" && isEquity && (
        <Badge variant="outline" className="rounded-none font-normal text-muted-foreground">
          {data.reinvest ? "Dividends reinvested" : "Price only"}
        </Badge>
      )}
    </div>
    ) : null;
  const warningsEl =
    data && data.warnings.length > 0 ? (

    <Alert className="rounded-none border-border">
      <AlertTriangle />
      <AlertDescription>
        {data.warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </AlertDescription>
    </Alert>
    ) : null;
  const chartEl =
    data && computed ? (
      <GrowthChart buys={computed.buys} priceToday={val ? val.price : data.currentPrice} priceTodayDate={val ? val.date : data.currentPriceDate} unit={isEquity ? "shares" : "tokens"} leverage={data.leverage ? { times: data.leverage.settings.leverage, side: data.leverage.settings.side, series: data.leverage.series } : undefined} title={`${tokenSymbol(data.token)}, ${data.currency ? data.currency.symbol : "$"}${data.amount.toLocaleString("en-US")} a month`} />
    ) : null;

  return (
    <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
      {/* overflow-visible: the search dropdown has to extend past the card's bottom edge */}
      <Card className="cut-card overflow-visible rounded-none border border-border bg-card ring-0">
        <CardHeader className="border-b border-border pb-4">{modeTabs}</CardHeader>
        <CardContent className="pt-2 pb-0 sm:pb-1">
          {!formReady ? (
            <ParametersFormSkeleton />
          ) : mode === "fx" ? (
            <div className="flex flex-col gap-6">
              <FxPanel onHasResult={setFxHasResult} />
            </div>
          ) : (
          <form onSubmit={submit} noValidate className="stagger-in flex flex-col gap-4 [--stagger-base:140ms]">
            <div className="stagger-in grid grid-cols-1 gap-4 [--stagger-base:200ms] min-[480px]:grid-cols-2 lg:grid-cols-4">
              {kindRow}
              <div className="min-[480px]:col-span-2">
                {isMajor ? (
                  <Field id="major" label="Coin">
                    <CoinPicker id="major" value={major} onChange={setMajor} />
                  </Field>
                ) : mode === "equity" ? (
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
                    {tickerName && <RollText text={tickerName} className="text-xs text-muted-foreground" />}
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
              {isMajor || leveraged ? null : mode === "equity" ? (
                <Field id="reinvest" label="Dividends" className="min-[480px]:col-span-2">
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
                <Field id="chain" label="Chain" error={errors.chain} className="min-[480px]:col-span-2">
                  <Select value={chain} onValueChange={(v) => setChain(v as Chain)}>
                    <SelectTrigger id="chain" className="form-control-h w-full rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={selectContent}>
                      {CHAINS.map((c) => (
                        <SelectItem key={c} value={c} className="rounded-none">
                          <span className="flex items-center gap-2">
                            <ChainLogo chain={c} />
                            {CHAIN_LABELS[c]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field id="amount" className="min-[480px]:col-span-2" label={plan === "monthly" ? "Monthly amount" : plan === "once" ? "Amount" : "Amount each buy"} error={errors.amount ?? errors.currency}>
                {/* The currency sits in front of the number. Anything other than USD is converted at each month's own rate. */}
                <div className="flex">
                  <CurrencyPicker id="currency" ariaLabel="Currency" variant="compact" value={currency} onChange={setCurrency} className="w-[6.5rem]! shrink-0 border-r-0" />
                  <AmountInput
                    id="amount"
                    className="form-control-h min-w-0 flex-1 text-sm"
                    value={amount}
                    onValueChange={setAmount}
                    aria-invalid={!!errors.amount}
                  />
                  {/* How often it is bought, on the same row as the amount. Every month by default; the others buy only in some months, counted from the start month. */}
                  <Select value={leveraged ? "leverage" : plan} onValueChange={(v) => (v === "leverage" ? (setLev(String(DEFAULT_LEVERAGE)), setPlan("once")) : (setLev("1"), setPlan(v as Plan)))}>
                    <SelectTrigger id="plan" aria-label="How often you buy, or leverage" className="form-control-h w-[8.5rem]! shrink-0 rounded-none border-l-0 px-2 text-sm">
                      <SelectValue>{leveraged ? (side === "short" ? "Short" : "Leverage") : PLANS.find((p) => p.value === plan)?.short}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className={selectContent}>
                      {PLANS.map((p) => (
                        <SelectItem key={p.value} value={p.value} className="rounded-none">
                          {p.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="leverage" className="rounded-none">
                        Leverage
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Field>
              {leveraged && (
                <div className="min-[480px]:col-span-2 lg:col-span-4">
                
                <div className="flex flex-col gap-4 lg:max-w-2xl">
                  <div className="flex flex-col gap-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Leverage</span>
                      <span className="text-lg font-bold tabular-nums" aria-hidden>
                        {Math.min(levNum, MAX_LEVERAGE)}x
                      </span>
                    </div>
                    {leveraged && (
                      <>
                        <div role="group" aria-label="Direction" className="flex w-fit border border-input">
                          {(["long", "short"] as const).map((d) => (
                            <button key={d} type="button" aria-pressed={side === d} onClick={() => setSide(d)} className={cn("h-9 px-4 text-sm font-bold transition-colors", side === d ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary")}>
                              {d === "long" ? "Long" : "Short"}
                            </button>
                          ))}
                        </div>
                        <input
                          id="leverage"
                          type="range"
                          aria-label="Leverage"
                          min={2}
                          max={MAX_LEVERAGE}
                          step={1}
                          value={Math.min(MAX_LEVERAGE, Math.max(2, Number.isFinite(levNum) ? levNum : DEFAULT_LEVERAGE))}
                          onChange={(e) => setLev(e.target.value)}
                          aria-valuetext={`${levNum} times`}
                          className="h-2 w-full cursor-pointer accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground tabular-nums" aria-hidden>
                          {["2x", "25x", "50x", "75x", "100x"].map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {side === "short" ? "Liquidated if the price rises" : "Liquidated if the price falls"} about {liquidationDropPct(Math.min(levNum, MAX_LEVERAGE), side).toFixed(1)}% {side === "short" ? "above" : "below"} a buy.
                        </p>
                      </>
                    )}
                  </div>
                  {(errors.leverage || (Number.isFinite(levNum) && levNum > MAX_LEVERAGE)) && (
                    <p role="alert" className="text-sm font-bold">
                      {errors.leverage ?? `Leverage goes up to ${MAX_LEVERAGE}x`}
                    </p>
                  )}
                  {leveraged && (
                    <div className="flex flex-col gap-3">
                      <button type="button" aria-expanded={levMore} aria-controls="leverage-more" onClick={() => setLevMore((o) => !o)} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                        <ChevronDown className={cn("size-4 transition-transform", levMore && "rotate-180")} aria-hidden />
                        {levMore ? "Hide advanced settings" : "Advanced settings: funding, margin, stop loss"}
                      </button>
                      {levMore && (
                        <div id="leverage-more">
                    <div className="grid gap-4 border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
                            <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                              Funding (% a year)
                              <input inputMode="decimal" value={fundingApr} onChange={(e) => setFundingApr(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} className="form-control-h border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
                              <span className="text-xs">{DEFAULT_FUNDING_APR}% is the usual exchange rate</span>
                            </label>
                            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                              <label className="flex cursor-pointer items-center gap-2 transition-colors hover:text-foreground">
                                <input type="checkbox" checked={topUp} onChange={(e) => setTopUp(e.target.checked)} className="size-4 shrink-0 cursor-pointer accent-primary" />
                                Add margin to avoid liquidation
                              </label>
                              {topUp && (
                                <>
                                  <AmountInput aria-label="Most margin to add per buy, in dollars" placeholder="Up to $ per buy (optional)" value={topUpMax} onValueChange={setTopUpMax} className="form-control-h text-sm" />
                                  <AmountInput aria-label="Total margin budget across all buys, in dollars" placeholder="Budget in all, $ (optional)" value={topUpBudget} onValueChange={setTopUpBudget} className="form-control-h text-sm" />
                                </>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                              <label htmlFor="stop-loss">Stop loss per buy (optional)</label>
                              <div className="flex gap-2">
                                <div className="relative min-w-0 flex-1">
                                  {maxLoss !== "" && (
                                    <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-foreground">
                                      -
                                    </span>
                                  )}
                                  <AmountInput id="stop-loss" placeholder="No stop loss" value={maxLoss} onValueChange={setMaxLoss} className={cn("form-control-h w-full text-sm", maxLoss !== "" && "pl-5")} />
                                </div>
                                <div role="group" aria-label="Stop loss unit" className="flex shrink-0 border border-input">
                                  {(["%", "$"] as const).map((u) => (
                                    <button key={u} type="button" aria-pressed={stopUnit === u} onClick={() => setStopUnit(u)} className={cn("form-control-h w-12 justify-center text-sm font-bold transition-colors", stopUnit === u ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary")}>
                                      {u}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <span className="text-xs">{stopUnit === "%" ? "Closes a buy once it has lost this share of its money." : "Closes a buy once it has lost this many dollars."}</span>
                              {!topUp && (maxLoss === "" || (stopUnit === "%" ? parseAmount(maxLoss) >= 100 : parseAmount(maxLoss) >= parseAmount(amount))) && (
                                <span className="text-xs text-destructive">A buy is liquidated at -100% unless you add margin or set a stop loss below 100%.</span>
                              )}
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">Each buy opens its own position, as on a futures exchange. Fees are 0.045% each way. It uses daily closes, so real trading can be harsher.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                </div>
              )}
              {/* Start and end always sit side by side, at every width. */}
              <div className="grid grid-cols-2 gap-4 min-[480px]:col-span-2">
                <Field id="startMonth" label="Start month" error={errors.startMonth}>
                  <MonthPicker id="startMonth" value={startMonth} minYear={mode === "equity" ? 1980 : isMajor ? 2014 : undefined} min={launchMonth} max={endMonth || undefined} invalid={!!errors.startMonth} onChange={setStartMonth} />
                  {launchDate && <p className="text-xs text-muted-foreground">First price: {formatMonth(launchMonth!)}</p>}
                </Field>
                <Field id="endMonth" label="End month" error={errors.endMonth}>
                  <MonthPicker id="endMonth" value={endMonth} minYear={mode === "equity" ? 1980 : isMajor ? 2014 : undefined} min={startMonth && launchMonth && startMonth < launchMonth ? launchMonth : startMonth || launchMonth} invalid={!!errors.endMonth} onChange={setEndMonth} />
                  {/* Value the holding at the end month's price (as if sold then), not at today's price. */}
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground" title="Value what you bought at the end month's price instead of today's">
                    <input type="checkbox" checked={sellAtEnd} onChange={(e) => setSellAtEnd(e.target.checked)} className="size-4 w-4! shrink-0 cursor-pointer accent-primary" />
                    Sell at end month
                  </label>
                </Field>
              </div>
              <div className="flex flex-col gap-2 min-[480px]:col-span-2">
                <Field id="basis" label="Buy on" error={errors.basis ?? errors.basisDay}>
                  {/* One segmented control. "Day" carries its own day-of-month picker inside the segment. */}
                  <div role="radiogroup" aria-label="Which day of each month you buy" className="form-control-h grid w-full grid-cols-3 border border-border">
                    {(
                      [
                        ["month-end", "Month-end"],
                        ["first-of-month", "1st"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={basis === v}
                        onClick={() => {
                          setBasis(v);
                          setErrors((e) => ({ ...e, basis: undefined, basisDay: undefined }));
                        }}
                        className={cn("border-r border-border text-sm transition-colors", basis === v ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}
                      >
                        {label}
                      </button>
                    ))}
                    <div className={cn("flex min-w-0 items-stretch text-sm transition-colors", basis === "day-of-month" ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={basis === "day-of-month"}
                        onClick={() => {
                          setBasis("day-of-month");
                          setErrors((e) => ({ ...e, basis: undefined, basisDay: undefined }));
                        }}
                        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2"
                      >
                        <Settings className="size-3.5 shrink-0" aria-hidden />
                        Custom
                      </button>
                      {basis === "day-of-month" && (
                        <Select
                          value={String(basisDay)}
                          onValueChange={(v) => {
                            setBasisDay(Number(v));
                            setErrors((e) => ({ ...e, basisDay: undefined }));
                          }}
                        >
                          <SelectTrigger
                            id="basisDay"
                            aria-label="Day of the month (1 to 31)"
                            style={{ width: "3.75rem", flex: "0 0 3.75rem", height: "100%" }}
                            className="gap-1 rounded-none border-0 border-l border-primary-foreground/30 bg-transparent px-2 text-sm font-bold shadow-none focus-visible:ring-0 [&_svg]:text-primary-foreground"
                          >
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
                      )}
                    </div>
                  </div>
                  {basis === "day-of-month" && basisDay > 28 && <p className="text-xs text-muted-foreground">Shorter months use their last day.</p>}
                </Field>
              </div>
              <div className="flex flex-col gap-6 min-[480px]:col-span-2 lg:col-span-4">
                {/* Quick range: small chips on one line, not a labelled row of big buttons. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <span className="mr-1 text-sm text-muted-foreground">Quick range</span>
                  {(usesYahoo ? (isMajor ? [36, 60, 96] : [60, 120, 240]) : [6, 12, 24]).map((n) => (
                    <button key={n} type="button" onClick={() => applyPreset(n)} className="h-8 border border-border px-3 text-xs text-muted-foreground hover:border-primary hover:text-foreground sm:text-sm">
                      {usesYahoo ? `${n / 12} years` : `${n} months`}
                    </button>
                  ))}
                  <span className="text-xs text-muted-foreground">up to last month</span>
                </div>

                {/* The action: what you are about to run, in a sentence, and a button that is only as wide as its words. */}
                <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <p className="text-sm leading-snug text-muted-foreground" aria-live="polite">
                    {runSummary}
                  </p>
                  <Button
                    type="submit"
                    disabled={loading}
                    variant="default"
                    className="form-cta cut-both h-12 w-full shrink-0 gap-2 rounded-none border-2 border-primary px-8 text-base font-bold transition-transform hover:-translate-y-px active:translate-y-0 disabled:border-border sm:w-auto sm:min-w-56"
                  >
                    {loading ? <MarkLoader className="size-5" /> : <History className="size-5" aria-hidden />}
                    {loading ? "Checking prices" : "See what it's worth"}
                  </Button>
                </div>

                {/* Shortcuts, not controls: plain underlined text. */}
                <p className="flex flex-wrap items-baseline justify-end gap-x-5 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Try one:</span>
                  {EXAMPLES.map((ex) => (
                    <button key={ex.id} type="button" disabled={loading} title={ex.question} onClick={() => runExample(ex)} className="underline underline-offset-4 hover:text-muted-foreground disabled:opacity-50">
                      {ex.label}
                    </button>
                  ))}
                </p>
              </div>
            </div>
          </form>
          )}
        </CardContent>
      </Card>

      <TokenDetails chain={chain} address={usesYahoo || mode === "fx" ? "" : address} onLaunch={onTokenLaunch} />

      {loading && (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MarkLoader className="size-4" />
            Fetching prices. Rate-limit retries can take a few seconds.
          </p>
          <ResultsLoadingSkeleton />
        </div>
      )}

      {apiError && (
        <Alert variant="destructive" className="rounded-none border-border">
          <AlertTriangle />
          <AlertTitle>Couldn&apos;t load prices</AlertTitle>
          <AlertDescription>
            {apiError}
            {/* A stock price outage has a way out: the person's own free key. */}
            {mode === "equity" && /Yahoo|Tiingo/.test(apiError) && (
              <button type="button" onClick={() => window.dispatchEvent(new Event("replay:open-settings"))} className="mt-2 block font-bold underline underline-offset-4 hover:no-underline">
                Add your Tiingo key in Settings
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {data && computed && !loading && (
        <div ref={resultsRef} className="reveal-stack flex scroll-mt-[calc(4.5rem+env(safe-area-inset-top))] flex-col gap-6 sm:scroll-mt-28 sm:gap-8">
          {data.leverage && <LeverageCard result={data.leverage} plainGainPct={computed.summary.gainPct} sold={val?.sold} asset={assetHeader} />}
          {data.leverage && warningsEl}
          {data.leverage && chartEl}
          {data.leverage && (
            <button type="button" aria-expanded={plainOpen} onClick={() => setPlainOpen((o) => !o)} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ChevronDown className={cn("size-4 transition-transform", plainOpen && "rotate-180")} aria-hidden />
              {plainOpen ? "Hide the plain buys" : "Show the same plan without leverage"}
            </button>
          )}

          {(!data.leverage || plainOpen) && (
            <div className={cn("flex flex-col gap-6 sm:gap-8", data.leverage && "border-l-2 border-border pl-4")}>
          <section className="border border-border bg-card p-4 sm:p-6">
            {!data.leverage && assetHeader}
            {exampleNote && <p className="mb-4 text-sm text-muted-foreground">{exampleNote}</p>}
            {data.leverage && <p className="mb-4 text-sm text-muted-foreground">The same plan without leverage, for comparison. The chart and table below are for these plain buys.</p>}
            <div className="border-l-2 border-primary pl-4">
              <ResultSentence
                amount={data.amount}
                currency={data.currency && val ? { ...data.currency, perUsdToday: val.perUsd ?? data.currency.perUsdToday } : data.currency}
                sold={val?.sold}
                symbol={tokenSymbol(data.token)}
                summary={computed.summary}
                decimals={computed.decimals}
                total={data.plan ? computed.buys.filter((b) => b.buy !== false).length : computed.buys.length}
                plan={data.plan}
                shares={isEquity}
              />
            </div>
            {/* Majors aren't on the Wayback page, so the link is for stocks and tokens. */}
            {!(data.chain === "equity" && isMajorSymbol(data.address)) && data.rows[0] && (
              <p className="mt-4 text-sm text-muted-foreground">
                Want the exact price on a day?{" "}
                <Link
                  href={data.chain === "equity" ? `/wayback?chain=equity&asset=${encodeURIComponent(data.address)}&date=${data.rows[0].targetDate}` : `/wayback?chain=${data.chain}&asset=${encodeURIComponent(data.address)}&date=${data.rows[0].targetDate}`}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Look it up in Wayback
                </Link>
              </p>
            )}
          </section>

          {!data.leverage && warningsEl}

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
                  <CardDescription className="text-sm text-muted-foreground">{key}</CardDescription>
                  <CardTitle className="break-all text-base font-bold tabular-nums sm:text-lg">
                    <RollText text={value} />
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          {!data.leverage && chartEl}

          {!data.leverage && <InsightsCard buys={computed.buys} priceToday={val ? val.price : data.currentPrice} priceTodayDate={val ? val.date : data.currentPriceDate} amount={data.amount} />}

          {computed.summary.skippedMonths > 0 && (
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {computed.summary.skippedMonths} of {computed.buys.length} month(s) have no price (n/a) and are excluded from every total:{" "}
                {compressMonths(computed.summary.skipped).join(", ")}. Enter a price manually to include a month.
              </span>
            </p>
          )}

          <MonthFilterBar buys={computed.buys} filter={monthFilter} onChange={setMonthFilter} shown={shownBuys.length} />
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground" title="Prices come from the data source. Switch this on to type your own price for any month and see the totals change.">
            <input type="checkbox" checked={editPrices} onChange={(e) => setEditPrices(e.target.checked)} className="size-4 shrink-0 cursor-pointer accent-primary" />
            Edit prices (what-if)
          </label>

          {shownBuys.length === 0 && (
            <p className="border border-border p-6 text-center text-sm text-muted-foreground">
              No months match these filters.{" "}
              <button type="button" onClick={() => setMonthFilter(NO_FILTER)} className="underline underline-offset-4 hover:text-foreground">
                Reset the filters
              </button>
            </p>
          )}

          <div className="overflow-x-auto border border-border bg-background/80 backdrop-blur-xl">
            <p className="sr-only">Monthly buy breakdown table</p>
            <Table className="min-w-[900px]" containerClassName="max-h-[34rem] overflow-auto">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  {(["Month", "Price date", "Price (USD)", "Amount (USD)", isEquity ? "Shares bought" : "Tokens bought", `Value ${when} (USD)`, "Source", "Note"] as const).map((h, i) => (
                    <TableHead key={h} className={cn("sticky top-0 z-10 bg-card text-sm text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]", i === 0 && "left-0 z-20 shadow-[inset_0_-1px_0_var(--border),inset_-1px_0_0_var(--border)]", i >= 2 && i <= 5 && "text-right")}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownBuys.map((b) => {
                  const original = data.rows.find((r) => r.month === b.month)?.price ?? null;
                  const readOnlyPrice = !editPrices && !b.manual;
                  return (
                    <TableRow key={b.month} className="align-top odd:bg-muted/40 hover:bg-muted/60">
                      {/* The month stays in view while the other columns scroll sideways on a phone. */}
                      <TableCell className="sticky left-0 z-[5] bg-card font-bold shadow-[inset_-1px_0_0_var(--border)]">{b.month}</TableCell>
                      <TableCell>{b.priceDate ?? (b.manual ? "manual" : NA)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {readOnlyPrice ? (
<span className="block w-32 text-right tabular-nums">{original === null ? "No price" : fmtPrice(original)}</span>
) : (
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
)}
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
                        {b.source === "none" ? NA : <SourceBadge source={b.source} sources={data.sources} />}
                      </TableCell>
                      <TableCell className="whitespace-normal text-xs">
                        {b.buy === false && <span className="text-muted-foreground">Not a buying month</span>}
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

            </div>
          )}

          <div className="flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{data.leverage ? "The spreadsheet covers the plain buys only. Set leverage to off to export." : "Download results for accounting or offline review."}</p>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-none transition-transform hover:-translate-y-px active:translate-y-0 sm:h-10 sm:w-auto"
              onClick={() => doExport()}
              disabled={exporting || !!data.leverage}
              title={data.leverage ? "The spreadsheet has the plain (unleveraged) buys, so it is off while a leveraged result is showing. Set leverage to 1x to export." : undefined}
            >
              {exporting ? <MarkLoader /> : <FileSpreadsheet />}
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
                {sharing ? <MarkLoader /> : <Share2 />}
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

      {/* Asked when a tab is switched while the results haven't been exported or shared. */}
      <Dialog open={pendingMode !== null} onOpenChange={(o) => !o && setPendingMode(null)}>
        <DialogContent>
          <div className="flex flex-col gap-1 pr-6">
            <DialogTitle>Clear these results?</DialogTitle>
            <DialogDescription>Switching tab clears the results on screen. They can&apos;t be brought back unless you export them or save a share link first.</DialogDescription>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-10 rounded-none" onClick={() => setPendingMode(null)}>
              Keep my results
            </Button>
            <Button
              type="button"
              className="h-10 rounded-none font-bold"
              onClick={() => {
                const next = pendingMode;
                setPendingMode(null);
                if (next) switchMode(next);
              }}
            >
              Switch and clear
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
