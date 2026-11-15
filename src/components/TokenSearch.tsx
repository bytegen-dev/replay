"use client";

import { Info, Loader2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtPrice } from "@/lib/format.ts";
import { MIN_LIQUIDITY_USD, SORT_LABELS, shouldSearch, sortHits, type SortKey, type TokenHit } from "@/lib/tokenSearch.ts";
import { CHAIN_LABELS, type Chain } from "@/lib/types.ts";
import { cn } from "@/lib/utils";

type Result = { q: string; hits: TokenHit[] } | { q: string; error: string };

const DEBOUNCE_MS = 350;
const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const shortAddress = (a: string) => (a.length > 16 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** The fine print about these results, kept out of the way until asked for. Click toggles it so it also works by touch. */
function ResultsInfo() {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About these results"
            onClick={(e) => {
              e.preventDefault(); // stops the tooltip's own click-to-close, so a tap toggles it
              setOpen((o) => !o);
            }}
            className="inline-flex size-7 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Info className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <p>Market cap is DexScreener&apos;s estimate and can be wrong or missing.</p>
          <p className="mt-1.5">Copycat tokens are common, so check the address and liquidity before you pick.</p>
          <p className="mt-1.5">Pools under ${MIN_LIQUIDITY_USD} of liquidity are hidden.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  chain: Chain;
  /** Called with the chosen token. The parent sets the chain and the address. */
  onPick: (hit: TokenHit) => void;
  invalid?: boolean;
  placeholder?: string;
}

/**
 * One box for both jobs: paste an address and it behaves like a normal input; type a name or ticker and
 * matching tokens drop down. A pasted address from another chain also finds its token and switches the chain.
 */
export function TokenSearchInput({ id, value, onChange, chain, onPick, invalid, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [active, setActive] = useState(0);
  const [sort, setSort] = useState<SortKey>("marketCap");
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const q = value.trim();
  const searching = shouldSearch(q, chain);

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/token-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const j = await r.json().catch(() => null);
        setRes(r.ok ? { q, hits: j.hits as TokenHit[] } : { q, error: j?.error ?? "Search failed. Try again." });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRes({ q, error: "Search failed. Try again." });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, searching]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const cur = res?.q === q ? res : null;
  const rawHits = cur && "hits" in cur ? cur.hits : null;
  const hits = useMemo(() => (rawHits ? sortHits(rawHits, sort) : []), [rawHits, sort]);
  const loading = searching && !cur;
  const visible = open && searching;

  function pick(h: TokenHit) {
    onPick(h);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!visible) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault(); // choose the token instead of submitting the form
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <Input
        id={id}
        role="combobox"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={visible && hits[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        className="h-11 pr-9 text-base sm:h-10 sm:text-sm"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      {loading && <Loader2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />}

      {visible && (
        // Keeps focus in the input while you click inside the list or the sort buttons.
        <div onMouseDown={(e) => e.preventDefault()} className="absolute top-full right-0 left-0 z-50 mt-1 border border-border bg-popover shadow-lg">
          {hits.length > 0 && (
            <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{hits.length > 1 ? "Sort by" : "1 result"}</span>
                <ResultsInfo />
              </div>
              {hits.length > 1 && (
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={sort}
                onValueChange={(v) => {
                  if (!v) return;
                  setSort(v as SortKey);
                  setActive(0);
                }}
                className="w-full flex-wrap"
                aria-label="Sort results"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <ToggleGroupItem key={k} value={k} className="h-9 min-w-[45%] flex-1 rounded-none border border-border px-1 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:h-8 sm:min-w-0">
                    {SORT_LABELS[k]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              )}
            </div>
          )}

          {loading && <p className="p-4 text-sm text-muted-foreground">Searching tokens</p>}
          {cur && "error" in cur && (
            <p role="alert" className="p-4 text-sm">
              {cur.error}
            </p>
          )}
          {cur && "hits" in cur && hits.length === 0 && <p className="p-4 text-sm text-muted-foreground">No tokens found for &ldquo;{q}&rdquo;. Try the ticker, or paste the address.</p>}
          {hits.length > 0 && (
            <ul ref={listRef} id={listId} role="listbox" aria-label="Matching tokens" className="max-h-80 overflow-y-auto py-1">
              {hits.map((h, i) => (
                <li
                  key={`${h.chain}:${h.address}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(h)}
                  className={cn("flex cursor-pointer items-center gap-3 px-3 py-2", i === active && "bg-primary text-primary-foreground")}
                >
                  {h.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.logo} alt="" width={28} height={28} referrerPolicy="no-referrer" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="size-7 shrink-0 border border-border object-cover" />
                  ) : (
                    <span className="size-7 shrink-0 border border-border" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="truncate font-bold">{h.name}</span>
                      <span className={cn("shrink-0 text-xs", i === active ? "text-primary-foreground" : "text-muted-foreground")}>{h.symbol}</span>
                      <Badge variant="outline" className={cn("shrink-0 rounded-none px-1.5 py-0 text-[0.65rem] font-normal", i === active && "border-primary-foreground text-primary-foreground")}>
                        {CHAIN_LABELS[h.chain]}
                      </Badge>
                    </span>
                    <span className={cn("block truncate text-xs tabular-nums", i === active ? "text-primary-foreground" : "text-muted-foreground")}>
                      {shortAddress(h.address)}
                      {h.priceUsd !== null && ` · $${fmtPrice(h.priceUsd)}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums">
                    <span className="block font-bold">
                      {typeof h.marketCap === "number" ? `$${compact(h.marketCap)}` : "n/a"} <span className="font-normal">mcap</span>
                    </span>
                    <span className={cn("block", i === active ? "text-primary-foreground" : "text-muted-foreground")}>${compact(h.liquidityUsd)} liq</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
