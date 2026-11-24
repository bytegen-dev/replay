"use client";

import { FileSpreadsheet, ImageDown, RefreshCw, Search, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoinTable } from "@/components/CoinTable";
import { Toast } from "@/components/Toast";
import { tradesWithout, withoutCoins } from "@/lib/fumble/hide.ts";
import { MarkLoader } from "@/components/MarkLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isWalletAddress } from "@/lib/fumble/helius.ts";
import { solName } from "@/lib/fumble/solName.ts";
import type { ApiResult, ApiTrades } from "@/lib/fumble/service.ts";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { applyChoice, DEFAULT_SETTINGS, PER_LOAD_CHOICES, readSettings, writeSettings, type FumbleSettings } from "@/lib/fumble/settings.ts";
import { ImagePreviewDialog } from "@/components/ImagePreviewDialog";
import { downloadFile } from "@/lib/download.ts";
import { figure, showIn, SOL_UNIT, USD_UNIT, type Display, type Unit } from "@/lib/fumble/money.ts";
import { fumbleCardFileName, renderFumbleCard } from "@/lib/fumble/card.ts";
import { coinRows, type CoinRow } from "@/lib/fumble/coins.ts";
import { renderTradeCard, tradeCardFileName } from "@/lib/fumble/tradeCard.ts";
import { humanSiteKey, passHumanCheck } from "@/lib/humanClient.ts";
import { makeEventReader, tokenLabel, veryActive, fumbleFileName, reachSpan, parseRecent, rememberWallet, shortMint, RECENT_KEY, type RecentWallet, type StreamEvent } from "@/lib/fumble/view.ts";
import { cn } from "@/lib/utils";

type Progress = { stage: "history" | "prices" | "done"; done: number; total: number };

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
  // True while "load more" is reading: the table stays, and the progress shows under it.
  const [loadingMore, setLoadingMore] = useState(false);
  // The page's settings (primary currency, second value, sells only, load size), remembered in this browser. The page starts on the defaults and
  // picks up what was saved a moment after it loads, so the server's page and the first paint agree.
  const [settings, setSettings] = useState<FumbleSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });
  const update = useCallback((patch: Partial<FumbleSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setSettings(readSettings()), 0);
    return () => clearTimeout(id);
  }, []);
  // Today's rates for the chosen currencies that are not SOL or dollars.
  const [rates, setRates] = useState<Record<string, { symbol: string; perUsd: number }>>({});
  useEffect(() => {
    let live = true;
    for (const code of new Set([settings.currency, settings.second])) {
      if (code === "SOL" || code === "USD" || code === "NONE") continue;
      fetch(`/api/fx/rate?code=${encodeURIComponent(code)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { symbol?: string; perUsd?: number } | null) => {
          if (live && j && typeof j.perUsd === "number" && j.perUsd > 0) setRates((prev) => ({ ...prev, [code]: { symbol: j.symbol ?? code, perUsd: j.perUsd as number } }));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [settings.currency, settings.second]);
  // What the figures are shown in. A currency with no rate (yet) is left out: the big figure shows in SOL, the small line is dropped.
  const display = useMemo<Display>(() => {
    const unit = (code: string): Unit | null => (code === "SOL" ? SOL_UNIT : code === "USD" ? USD_UNIT : rates[code] ? { code, symbol: rates[code].symbol, perUsd: rates[code].perUsd } : null);
    const primary = unit(settings.currency) ?? SOL_UNIT;
    let second = settings.second === "NONE" ? null : unit(settings.second);
    // The same currency twice says nothing new: show SOL under dollars, and dollars under anything else.
    if (second && second.code === primary.code) second = primary.code === "SOL" ? USD_UNIT : SOL_UNIT;
    return showIn(primary, second);
  }, [settings.currency, settings.second, rates]);
  // When the trades on screen were last updated, for saying how far back they reach.
  const [asOf, setAsOf] = useState(0);
  const abort = useRef<AbortController | null>(null);
  // The wallets last scanned in this browser, offered again when the page is empty. Read after the page loads, so the server's page and the first paint agree.
  const [recent, setRecent] = useState<RecentWallet[]>([]);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        setRecent(parseRecent(localStorage.getItem(RECENT_KEY)));
      } catch {
        /* storage is blocked: no recent wallets */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const scan = useCallback(async (wallet: string, more = false, refresh = false) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus("scanning");
    setError(null);
    setProgress({ stage: "history", done: 0, total: 0 });
    setLoadingMore(more);
    // Loading more, or refreshing, keeps the trades already on screen, and the new ones join them as they are read.
    if (!more && !refresh) {
      setTrades(null);
      setResult(null);
    }
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
        setAsOf(Math.floor(Date.now() / 1000));
        setTrades(e.data);
        if (veryActive(e.data.coverage, Math.floor(Date.now() / 1000))) setActive(true);
      }
      else if (e.type === "result") {
        finished = true;
        try {
          const next = rememberWallet(parseRecent(localStorage.getItem(RECENT_KEY)), e.data.wallet, Math.floor(Date.now() / 1000));
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          setRecent(next);
        } catch {
          /* storage is blocked: the wallet is simply not remembered */
        }
        setTrades(e.data);
        setResult(e.data);
        setStatus("done");
      } else if (e.type === "error") fail(e.message);
    });

    try {
      const post = () => fetch("/api/fumble/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, ...(more ? { more: true } : {}), ...(refresh ? { refresh: true } : {}), ...(settingsRef.current.perLoad !== DEFAULT_SETTINGS.perLoad ? { limit: settingsRef.current.perLoad } : {}) }), signal: ctl.signal });
      let res = await post();
      // The invisible bot check: pass it once (usually unseen, and good for 12 hours here and in Wayback), then scan again.
      if (res.status === 403) {
        const j = (await res.clone().json().catch(() => null)) as { code?: string } | null;
        const key = j?.code === "human_required" ? await humanSiteKey() : null;
        if (key) {
          await passHumanCheck(key);
          res = await post();
        }
      }
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

  // As soon as a valid address is typed or pasted, a quick look asks whether it has any transactions, so an unused or mistyped wallet is turned
  // back here and never reaches a scan. The answer belongs to the address it was asked for; a failed look says nothing, and the scan may go ahead.
  const [looked, setLooked] = useState<{ wallet: string; status: "active" | "empty" | "unknown" } | null>(null);
  useEffect(() => {
    const w = value.trim();
    if (!isWalletAddress(w)) return;
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/fumble/check?wallet=${w}`, { signal: ctl.signal });
        const j = (await res.json().catch(() => null)) as { status?: string } | null;
        setLooked({ wallet: w, status: j?.status === "empty" ? "empty" : j?.status === "active" ? "active" : "unknown" });
      } catch {
        if (!ctl.signal.aborted) setLooked({ wallet: w, status: "unknown" });
      }
    }, 350);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [value]);
  const emptyWallet = looked?.status === "empty" && looked.wallet === value.trim();

  // A plain word that is not an address could be a .sol name: it is offered with ".sol" after it, and Tab (or a tap on the hint) takes it.
  const typed = value.trim();
  const nameStart = typed !== "" && /^[a-z0-9_-]{1,63}$/i.test(typed) && !isWalletAddress(typed) && status !== "scanning";
  function addSol() {
    setValue(`${typed}.sol`);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let wallet = value.trim();
    if (emptyWallet) return;
    // A name like bytegen.sol is turned into the wallet that owns it first.
    if (solName(wallet)) {
      setError(null);
      setStatus("scanning");
      try {
        const res = await fetch(`/api/fumble/resolve?name=${encodeURIComponent(wallet)}`);
        const j = (await res.json().catch(() => null)) as { wallet?: string; error?: string } | null;
        if (!res.ok || !j?.wallet) {
          setError(j?.error ?? "Couldn't look that name up. Try the wallet address.");
          setStatus("error");
          return;
        }
        wallet = j.wallet;
        setValue(wallet);
      } catch {
        setError("Couldn't look that name up. Try the wallet address.");
        setStatus("error");
        return;
      }
    }
    if (!isWalletAddress(wallet)) {
      setError("Enter a wallet address, or a name ending in .sol.");
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
  // The trades by coin: from the trade list as it is read, with the dollar values and fumbles added once the scan has finished. A coin hidden with its
  // eye button (kept per wallet, until the page is left) is left out.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<CoinRow | null>(null);
  const allCoins = useMemo(() => {
    if (!trades) return [];
    const profits = result ? Object.fromEntries(result.sells.map((x) => [x.signature, { profitSol: x.profitSol, matchedTokens: x.matchedTokens }])) : trades.pnl;
    return coinRows(trades.trades, profits, result?.coins ?? null);
  }, [trades, result]);
  const keyOf = (mint: string) => `${trades?.wallet}:${mint}`;
  const shown = allCoins.filter((c) => !hidden.has(keyOf(c.mint)) && (!settings.sellsOnly || c.soldTokens > 0));
  const hiddenCount = allCoins.filter((c) => hidden.has(keyOf(c.mint))).length;
  // A hidden coin drops out of the totals, the picture and the spreadsheet as well as the table, so the card adds up to the rows shown.
  const hiddenMints = useMemo(() => new Set(allCoins.filter((c) => hidden.has(keyOf(c.mint))).map((c) => c.mint)), [allCoins, hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  const viewTrades = trades ? tradesWithout(trades, hiddenMints) : null;
  const viewResult = useMemo(() => (result ? withoutCoins(result, hiddenMints) : null), [result, hiddenMints]);
  const [toast, setToast] = useState<{ mint: string; ticker: string } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const sharedTicker = sharing && trades ? tokenLabel(sharing.mint, trades.tokens).ticker : "";
  const sharedImage = sharing && trades ? tokenLabel(sharing.mint, trades.tokens).image : undefined;
  const renderShared = useCallback(() => renderTradeCard(sharing!, sharedTicker, display, asOf || Math.floor(Date.now() / 1000), sharedImage), [sharing, sharedTicker, display, asOf, sharedImage]);

  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        className ?? "mt-6",
        // Until there is something to show, the heading and field sit lower on the screen instead of leaving it empty below; they slide up when a scan starts.
        !launch && "transition-[padding-top] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        !launch && !trades && !scanning && "pt-[16dvh]",
      )}
    >
      <div className={cn(aside && "cut-card pulse-hover grid items-center gap-8 border border-border bg-card p-5 sm:p-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12")}>
        <div className="flex flex-col gap-6">
          {intro}
              <form onSubmit={submit} noValidate className="max-w-2xl">
                <Label htmlFor="fumble-wallet" className="sr-only">
                  Solana wallet address
                </Label>
                <div className="flex">
                  {/* The box and the button meet with no gap, like the waitlist form: the box has its bottom-left corner cut, the button its top-right. */}
                  <div className="cut-bl relative h-11 min-w-0 flex-1 sm:h-12">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    {/* The ".sol" that Tab would add, shown after what was typed (an invisible copy of the text holds its place). */}
                    {nameStart && (
                      <div aria-hidden className="input-ghost pointer-events-none absolute inset-y-0 right-3 left-9 flex items-center overflow-hidden text-sm">
                        <span className="invisible whitespace-pre">{value}</span>
                        <span className="text-muted-foreground">.sol</span>
                      </div>
                    )}
                    <Input
                      id="fumble-wallet"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey && nameStart) {
                          e.preventDefault();
                          addSol();
                        }
                      }}
                      placeholder="Wallet address or name.sol"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-invalid={emptyWallet || (status === "error" && !trades)}
                      className="h-full w-full rounded-none border-0 bg-transparent pr-3 pl-9 text-sm shadow-none focus-visible:ring-0 aria-invalid:ring-0 dark:aria-invalid:ring-0"
                    />
                  </div>
                  <Button type="submit" disabled={scanning || emptyWallet} className="cut-tr cut-primary h-11 shrink-0 gap-2 rounded-none border-0 px-5 text-sm font-bold text-primary-foreground sm:h-12 sm:px-7 sm:text-base">
                    {scanning && <MarkLoader className="size-4" />}
                    {scanning ? "Scanning" : "Scan"}
                  </Button>
                </div>
                {emptyWallet ? (
                  <p role="status" className="mt-2 text-sm font-bold">
                    No transactions found for this wallet.
                  </p>
                ) : nameStart ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <button type="button" onClick={addSol} className="font-bold text-foreground underline underline-offset-4 hover:text-primary">
                      Press Tab to add .sol
                    </button>
                  </p>
                ) : (
                  error && (
                    <p role="alert" className="mt-2 text-sm font-bold">
                      {error}
                    </p>
                  )
                )}
              </form>
              <div data-human-slot />

              {!launch && !trades && !scanning && recent.length > 0 && (
                <div className="flex max-w-2xl flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Recent</span>
                  {recent.map((r) => (
                    <button
                      key={r.wallet}
                      type="button"
                      onClick={() => {
                        setValue(r.wallet);
                        void scan(r.wallet);
                      }}
                      className="border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                    >
                      {shortMint(r.wallet)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.removeItem(RECENT_KEY);
                      } catch {
                        /* nothing stored that could be removed */
                      }
                      setRecent([]);
                    }}
                    className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
              )}

              {scanning && !launch && !loadingMore && <ProgressLine progress={progress} hasTrades={!!trades} reading={trades?.partial ?? true} active={active} />}
        </div>
        {aside && <div className="hidden lg:order-first lg:block">{aside}</div>}
      </div>

      {trades && (
        <>
          <Summary trades={viewTrades ?? trades} result={viewResult} asOf={asOf} display={display} settings={settings} onSettings={update} busy={scanning} onRefresh={() => void scan(trades.wallet, false, true)} />
          <CoinTable
            coins={shown}
            tokens={trades.tokens}
            done={status === "done"}
            display={display}
            hiddenCount={hiddenCount}
            onHide={(mint) => {
              setHidden((h) => new Set(h).add(keyOf(mint)));
              setToast({ mint, ticker: tokenLabel(mint, trades.tokens).ticker });
            }}
            onShowHidden={() => setHidden((h) => new Set([...h].filter((k) => !k.startsWith(`${trades.wallet}:`))))}
            onShare={setSharing}
          />
          {toast && (
            <Toast
              message={`${toast.ticker} hidden, and out of the totals.`}
              action="Undo"
              onAction={() => {
                setHidden((h) => {
                  const next = new Set(h);
                  next.delete(keyOf(toast.mint));
                  return next;
                });
                setToast(null);
              }}
              onClose={closeToast}
            />
          )}
          {sharing && <ImagePreviewDialog open title={`Your ${sharedTicker} trade`} fileName={tradeCardFileName(sharedTicker, sharing.lastAt)} render={renderShared} onClose={() => setSharing(null)} />}
          {/* The wallet has more: another hundred trades are read from where this stopped. */}
          {trades.coverage.extendable && (result || loadingMore) && (
            <div className="flex flex-col items-start gap-3">
              <Button type="button" variant="outline" disabled={scanning} onClick={() => void scan(trades.wallet, true)} className="cut-btn h-11 gap-2 rounded-none px-6 text-sm font-bold">
                {scanning && loadingMore && <MarkLoader className="size-4" />}
                {scanning && loadingMore ? "Loading" : "Load more"}
              </Button>
              {scanning && loadingMore && <ProgressLine progress={progress} hasTrades reading={trades.partial} active={active} />}
            </div>
          )}
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
    <div role="status" aria-live="polite" className="enter-up max-w-2xl" style={{ "--base": "0ms" } as React.CSSProperties}>
      <p className="text-sm text-muted-foreground">{label}</p>
      {active && <p className="mt-1 text-sm text-foreground">This wallet is very active, so this can take a while.</p>}
      {/* The track draws itself in from the left. While reading, how much is left is not known, so a short bar runs along it instead of a length. */}
      <div className="progress-track mt-2 h-0.5 w-full overflow-hidden bg-border">
        {pct === null ? <div className="progress-sweep h-full w-1/3 bg-primary" /> : <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />}
      </div>
    </div>
  );
}

/** One headline number: dollars big, SOL under it, and what it means in a line. A signed one (profit) is green for a gain and red for a loss. */
function Stat({ label, dollars, sols, display, pending, empty, signed, about, className, texture, hero, loading }: { label: string; dollars: number; sols: number; display: Display; pending: boolean; empty?: boolean; signed?: boolean; about?: string; className?: string; texture?: boolean; hero?: boolean; loading?: boolean }) {
  const tone = hero && !pending && !empty ? "text-destructive" : signed && !pending && !empty ? (sols > 0 ? "text-primary" : sols < 0 ? "text-destructive" : "") : "";
  // A dollar value of exactly nothing next to a SOL amount means no dollar price was found, not that it is worth nothing.
  const fig = figure(display, sols, dollars === 0 && sols !== 0 ? null : dollars, signed);
  return (
    <div className={cn("relative flex flex-col gap-1 p-5 sm:p-6 [&>p]:relative [&>p]:z-10", className)}>
      {/* The site's dotted texture behind the card's text. */}
      {texture && (
        <span
          aria-hidden
          // The card's top right corner is cut (18px). On a phone this block spans the whole card, so the texture is cut there too and stays inside the
          // edge; from the wide layout up the block is the left third and its corner is not on the card's edge.
          className={cn("tex-layer [--tex-clip:polygon(0_0,calc(100%-18px)_0,100%_18px,100%_100%,0_100%)]", !hero && "sm:[--tex-clip:none]")}
          // Very faint, still (the site's version drifts), and fading out from the top right corner so it never competes with the numbers.
          style={{ clipPath: "var(--tex-clip)", opacity: 0.13, animation: "none", maskImage: "linear-gradient(205deg, #000 0%, rgb(0 0 0 / 0.35) 32%, transparent 62%)", WebkitMaskImage: "linear-gradient(205deg, #000 0%, rgb(0 0 0 / 0.35) 32%, transparent 62%)" } as React.CSSProperties}
        />
      )}
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("font-heading leading-none font-bold tabular-nums", hero ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl", loading && "animate-pulse", pending && "text-muted-foreground", tone)}>{pending ? "\u2026" : empty ? "\u2014" : fig.main}</p>
      <p className={cn("h-5 text-sm tabular-nums text-muted-foreground", loading && "animate-pulse")}>{pending || empty ? "" : (fig.sub ?? "")}</p>
      {about && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{about}</p>}
    </div>
  );
}

/**
 * A currency choice: SOL, or a currency from the list (dollars first; the list includes them). Opening the list counts as choosing the currency it
 * shows. With `none` there is also a button for no currency at all.
 */
function CurrencyChoice({ id, label, currency, onPick, none = false }: { id: string; label: string; currency: string; onPick: (code: string) => void; none?: boolean }) {
  const [other, setOther] = useState("USD");
  const box = "flex h-8 items-center border px-2.5 text-xs font-bold transition-colors";
  const on = "border-primary text-primary";
  const off = "border-border text-muted-foreground hover:text-foreground";
  const otherOn = currency !== "SOL" && currency !== "NONE";
  const shown = otherOn ? currency : other;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {none && (
        <button type="button" aria-pressed={currency === "NONE"} onClick={() => onPick("NONE")} className={cn(box, currency === "NONE" ? on : off)}>
          None
        </button>
      )}
      <button type="button" aria-pressed={currency === "SOL"} onClick={() => onPick("SOL")} className={cn(box, currency === "SOL" ? on : off)}>
        SOL
      </button>
      <div className={cn("flex h-8 items-center border", otherOn ? on : off)}>
        <CurrencyPicker
          id={id}
          ariaLabel={label}
          variant="compact"
          value={shown}
          onOpen={() => !otherOn && onPick(shown)}
          onChange={(code) => {
            setOther(code);
            onPick(code);
          }}
          className="h-8! max-h-none! min-h-0! w-[6.5rem]! border-0! bg-transparent! text-xs"
        />
      </div>
    </div>
  );
}

/** A row of choices where exactly one is picked. */
function Choice<T extends string | number>({ value, options, onPick, label }: { value: T; options: { value: T; text: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onPick(o.value)}
          className={cn("flex h-8 items-center border px-2.5 text-xs font-bold transition-colors", value === o.value ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground")}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** The gear button in the corner of the summary, and the settings box it opens. Settings are saved in this browser. */
function FumbleSettingsDialog({ settings, onChange }: { settings: FumbleSettings; onChange: (patch: Partial<FumbleSettings>) => void }) {
  const row = "flex flex-col gap-2 py-4";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label="Settings" title="Settings" className="absolute top-2 right-2.5 z-20 flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground">
          <Settings className="size-6" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1 pr-6">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">Choose the currency, the table and how many trades load at a time.</DialogDescription>
        </div>
        <div className="divide-y divide-border">
          <div className={row}>
            <p className="text-sm font-bold">Primary currency</p>
            <CurrencyChoice id="fumble-primary" label="Primary currency" currency={settings.currency} onPick={(code) => onChange(applyChoice(settings, "primary", code))} />
          </div>
          <div className={row}>
            <p className="text-sm font-bold">Secondary currency</p>
            <CurrencyChoice id="fumble-secondary" label="Secondary currency" currency={settings.second} onPick={(code) => onChange(applyChoice(settings, "secondary", code))} none />
            <p className="text-xs leading-snug text-muted-foreground">Converted at today&rsquo;s rate.</p>
          </div>
          <div className={row}>
            <p className="text-sm font-bold">Table</p>
            <Choice
              label="Table"
              value={settings.sellsOnly ? "sells" : "all"}
              options={[
                { value: "all", text: "All coins" },
                { value: "sells", text: "Sold coins only" },
              ]}
              onPick={(v) => onChange({ sellsOnly: v === "sells" })}
            />
          </div>
          <div className={row}>
            <p className="text-sm font-bold">Trades per load</p>
            <Choice label="Trades per load" value={settings.perLoad} options={PER_LOAD_CHOICES.map((n) => ({ value: n, text: String(n) }))} onPick={(perLoad) => onChange({ perLoad })} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ trades, result, asOf, display, settings, onSettings, busy, onRefresh }: { trades: ApiTrades; result: ApiResult | null; asOf: number; display: Display; settings: FumbleSettings; onSettings: (patch: Partial<FumbleSettings>) => void; busy: boolean; onRefresh: () => void }) {
  const unknown = result?.unknown ?? 0;
  const unknownPositions = result ? result.positions.filter((p) => p.status === "unknown").length : 0;
  const sells = trades.trades.filter((t) => t.side === "sell").length;
  const tracedSells = result ? result.sells.filter((x) => x.matchedTokens > 0).length : 0;
  const partial = result?.partialSells ?? 0;
  const cov = trades.coverage;
  const [previewOpen, setPreviewOpen] = useState(false);
  const renderCard = useCallback((privacy: boolean) => renderFumbleCard(result!, asOf || Math.floor(result!.scannedAt), display, { privacy }), [result, asOf, display]);
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
  // One line says how much was read; anything that limits the numbers follows in a few short words, only when it applies.
  const reach = cov.oldest ? reachSpan(cov.oldest, asOf || Math.floor(trades.coverage.oldest ?? 0)) : null;
  const notes = [
    partial > 0 ? `Buys for ${partial} ${partial === 1 ? "sell" : "sells"} are older than this window.` : null,
    result?.ranOutOfTime ? "Ran out of time pricing every coin." : unknown > 0 || unknownPositions > 0 ? "Some coins couldn't be priced." : null,
  ].filter((n): n is string => n !== null);
  return (
    <section aria-label="Summary" className="cut-card pulse-hover border border-border bg-card" style={{ "--pulse-speed": "6s" } as React.CSSProperties}>
      {/* Refresh sits beside the settings gear: it looks for trades made since this scan, and only the new transactions are read, so it is quick. */}
      <button type="button" onClick={onRefresh} disabled={busy} aria-label="Refresh" title="Look for new trades" className="absolute top-2 right-[3.25rem] z-20 flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60">
        <RefreshCw className={cn("size-6", busy && "animate-spin")} aria-hidden />
      </button>
      <FumbleSettingsDialog settings={settings} onChange={onSettings} />
      {/* The headline is the total fumble; the three numbers under it are what it is made of (and the PnL, for the record). */}
      <Stat label="Total fumble" hero texture loading={busy} display={display} dollars={result?.totalMissedUsd ?? 0} sols={result?.totalMissedSol ?? 0} pending={!result} empty={!!result && result.measured === 0 && !result.positions.some((p) => p.status === "ok")} />
      <div className="grid border-t border-border sm:grid-cols-3">
        <Stat label="Missed after selling" loading={busy} display={display} dollars={result?.totalFumbleUsd ?? 0} sols={result?.totalFumbleSol ?? 0} pending={!result} about="Upside missed after you sold." />
        <Stat
          label="Roundtripped"
          loading={busy}
          display={display}
          dollars={result?.totalRoundTripUsd ?? 0}
          sols={result?.totalRoundTripSol ?? 0}
          pending={!result}
          empty={!!result && result.positions.length === 0}
          about="Peak profit minus realized."
          className="border-t border-border sm:border-t-0 sm:border-l"
        />
        <Stat label="PnL" loading={busy} display={display} dollars={result?.totalProfitUsd ?? 0} sols={result?.totalProfitSol ?? 0} pending={!result} empty={!!result && tracedSells === 0} signed about="Total realized profit." className="border-t border-border sm:border-t-0 sm:border-l" />
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-5 py-4 text-sm text-muted-foreground sm:px-6">
        <p>
          <span className="font-bold text-foreground tabular-nums">{trades.trades.length}</span> trades, <span className="font-bold text-foreground tabular-nums">{sells}</span> sells
          {reach && (
            <>
              , over{" "}
              <span title={reach.full} className="cursor-help">
                {reach.label}
              </span>
            </>
          )}
        </p>
        {notes.length > 0 && (
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {notes.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </p>
        )}
        {exportError && <p className="text-destructive">{exportError}</p>}
      </div>
      {/* The two things to take away, set apart from the notes above so they are easy to find. Only once this scan has finished. */}
      {result && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4 sm:px-6">
          <button type="button" onClick={() => setPreviewOpen(true)} disabled={busy} className="cut-btn cut-btn-solid inline-flex h-10 items-center gap-2 px-5 text-sm font-bold disabled:opacity-60">
            <ImageDown className="size-4" aria-hidden /> Download image
          </button>
          <ImagePreviewDialog open={previewOpen} title="Your fumble card" fileName={fumbleCardFileName(result)} fileNameFor={(privacy) => fumbleCardFileName(result, privacy)} privacyMode render={renderCard} onClose={() => setPreviewOpen(false)} />
          <button type="button" onClick={exportSheet} disabled={exporting || busy} className="cut-btn inline-flex h-10 items-center gap-2 px-5 text-sm font-bold text-primary disabled:opacity-60">
            <FileSpreadsheet className="size-4" aria-hidden /> {exporting ? "Preparing spreadsheet" : "Download spreadsheet"}
          </button>
        </div>
      )}
    </section>
  );
}
