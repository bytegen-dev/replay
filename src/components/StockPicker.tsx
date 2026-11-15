"use client";

import { ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchXStocks, type XStock } from "@/lib/xstocks.ts";

// One fetch per page load, shared by both pickers and every reopen.
let listPromise: Promise<XStock[]> | null = null;
function fetchList(): Promise<XStock[]> {
  listPromise ??= fetch("/api/xstocks")
    .then(async (res) => {
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
      return j.stocks as XStock[];
    })
    .catch((e) => {
      listPromise = null; // let the next open retry
      throw e;
    });
  return listPromise;
}

interface Props {
  id: string;
  value: XStock | null;
  onChange: (s: XStock) => void;
  invalid?: boolean;
}

export function StockPicker({ id, value, onChange, invalid }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<XStock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open || list) return;
    let live = true;
    fetchList().then(
      (l) => live && (setList(l), setError(null)),
      (e) => live && setError(e instanceof Error ? e.message : "Couldn't load the stock list"),
    );
    return () => {
      live = false;
    };
  }, [open, list]);

  const results = useMemo(() => (list ? searchXStocks(list, query) : []), [list, query]);

  // Keep the highlighted row on screen while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(s: XStock) {
    onChange(s);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-invalid={invalid}
          className="form-control-h w-full justify-between rounded-none font-normal"
        >
          {value ? (
            <span className="truncate">
              {value.name} <span className="text-muted-foreground">{value.symbol}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Search stocks, e.g. Tesla or NVDA</span>
          )}
          <ChevronsUpDown className="shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 rounded-none border border-border bg-popover p-0 ring-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            aria-label="Search stocks"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            placeholder="Search by name or ticker"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {!list && !error && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading stocks
          </p>
        )}
        {error && (
          <div className="flex flex-col items-start gap-2 p-4 text-sm">
            <p role="alert">{error}</p>
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => (setError(null), setOpen(false), setTimeout(() => setOpen(true), 0))}>
              Try again
            </Button>
          </div>
        )}
        {list && results.length === 0 && <p className="p-4 text-sm text-muted-foreground">No xStock matches &ldquo;{query.trim()}&rdquo;.</p>}
        {list && results.length > 0 && (
          <ul ref={listRef} id={listId} role="listbox" aria-label="xStocks on Solana" className="max-h-72 overflow-y-auto py-1">
            {results.map((s, i) => (
              <li
                key={s.mint}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={value?.mint === s.mint}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(s)}
                className={cn(
                  "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm",
                  i === active && "bg-primary text-primary-foreground",
                  value?.mint === s.mint && i !== active && "font-bold",
                )}
              >
                <span className="truncate">{s.name}</span>
                <span className={cn("shrink-0 text-xs", i === active ? "text-primary-foreground" : "text-muted-foreground")}>{s.symbol}</span>
              </li>
            ))}
          </ul>
        )}
        {list && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{results.length} of {list.length} xStocks on Solana</p>}
      </PopoverContent>
    </Popover>
  );
}
