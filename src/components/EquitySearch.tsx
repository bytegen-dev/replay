"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { StockHit } from "@/lib/stocks.ts";
import { cn } from "@/lib/utils";

type Result = { q: string; hits: StockHit[] } | { q: string; error: string };

const DEBOUNCE_MS = 300;

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (hit: StockHit) => void;
  invalid?: boolean;
}

/** One box for stocks: type a ticker (AAPL) or a company name (apple) and pick from the matches. */
export function EquitySearchInput({ id, value, onChange, onPick, invalid }: Props) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const q = value.trim();
  const searching = open && q.length >= 1;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const j = await r.json().catch(() => null);
        setRes(r.ok ? { q, hits: j.hits as StockHit[] } : { q, error: j?.error ?? "Search failed. Type the ticker directly." });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRes({ q, error: "Search failed. Type the ticker directly." });
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
  const hits = cur && "hits" in cur ? cur.hits : [];
  const loading = searching && !cur;

  function pick(h: StockHit) {
    onPick(h);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!searching) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault(); // choose the stock instead of submitting the form
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={searching}
        aria-controls={searching ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={searching && hits[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        className="h-11 pr-9 text-base uppercase placeholder:normal-case sm:h-10 sm:text-sm"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Ticker or company, e.g. AAPL or apple"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="characters"
      />
      {loading && <Loader2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />}

      {searching && (cur || loading) && (
        <div onMouseDown={(e) => e.preventDefault()} className="absolute top-full right-0 left-0 z-50 mt-1 border border-border bg-popover shadow-lg">
          {loading && <p className="p-4 text-sm text-muted-foreground">Searching stocks</p>}
          {cur && "error" in cur && (
            <p role="alert" className="p-4 text-sm">
              {cur.error}
            </p>
          )}
          {cur && "hits" in cur && hits.length === 0 && <p className="p-4 text-sm text-muted-foreground">No stock or ETF found for &ldquo;{q}&rdquo;. You can still try the ticker as typed.</p>}
          {hits.length > 0 && (
            <ul ref={listRef} id={listId} role="listbox" aria-label="Matching stocks" className="max-h-72 overflow-y-auto py-1">
              {hits.map((h, i) => (
                <li
                  key={`${h.symbol}:${h.exchange}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(h)}
                  className={cn("flex cursor-pointer items-center gap-3 px-3 py-2", i === active && "bg-primary text-primary-foreground")}
                >
                  <span className="w-16 shrink-0 text-sm font-bold">{h.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
                  <span className={cn("shrink-0 text-xs", i === active ? "text-primary-foreground" : "text-muted-foreground")}>{h.exchange}</span>
                  {h.type === "ETF" && (
                    <Badge variant="outline" className={cn("shrink-0 rounded-none px-1.5 py-0 text-[0.65rem] font-normal", i === active && "border-primary-foreground text-primary-foreground")}>
                      ETF
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
