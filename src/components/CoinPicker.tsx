"use client";

import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CoinLogo } from "@/components/ChainLogo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RollText } from "@/components/RollText";
import { MAJORS } from "@/lib/majors.ts";
import { cn } from "@/lib/utils";

function List({ value, onPick }: { value: string; onPick: (symbol: string) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? MAJORS.filter((m) => m.name.toLowerCase().includes(q) || m.ticker.toLowerCase().startsWith(q)) : MAJORS;
  }, [query]);
  const at = Math.min(active, Math.max(0, items.length - 1));
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(at + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(at - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (items[at]) onPick(items[at].symbol);
            }
          }}
          placeholder="Search coins"
          aria-label="Search coins"
          autoComplete="off"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
        {items.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No major coin matches “{query.trim()}”. Try Other tokens.</li>}
        {items.map((m, i) => (
          <li
            key={m.symbol}
            role="option"
            aria-selected={m.symbol === value}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(m.symbol)}
            className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm", i === at && "bg-secondary", m.symbol === value && "font-bold")}
          >
            <CoinLogo symbol={m.symbol} className="size-5 shrink-0" />
            <span className="truncate">{m.name}</span>
            <span className="text-muted-foreground">{m.ticker}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The major-coin picker, with a search box. */
export function CoinPicker({ id, value, onChange }: { id: string; value: string; onChange: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const coin = MAJORS.find((m) => m.symbol === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="form-control-h flex w-full items-center justify-between gap-2 border border-input bg-transparent px-3 text-sm outline-none hover:border-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex min-w-0 items-center gap-2">
            <CoinLogo symbol={value} className="size-4 shrink-0" />
            <RollText text={`${coin?.name ?? value} (${coin?.ticker ?? ""})`} />
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] gap-0 rounded-none border border-border bg-popover p-0 ring-0">
        <List
          value={value}
          onPick={(s) => {
            onChange(s);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
