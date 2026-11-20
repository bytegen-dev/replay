"use client";

import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RollText } from "@/components/RollText";
import { COMMODITIES, commodityFor, type Commodity } from "@/lib/commodities.ts";
import { cn } from "@/lib/utils";

const GROUPS: Commodity["group"][] = ["Metals", "Energy", "Grains", "Softs", "Livestock", "Other"];

function List({ value, onPick }: { value: string; onPick: (symbol: string) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // The matches in the order they are shown: by group, then as listed.
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? COMMODITIES.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().startsWith(q) || c.group.toLowerCase().startsWith(q) || c.also?.some((w) => w.startsWith(q)))
      : COMMODITIES;
    return GROUPS.flatMap((g) => found.filter((c) => c.group === g));
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
          placeholder="Search commodities"
          aria-label="Search commodities"
          autoComplete="off"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
        {items.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No commodity matches “{query.trim()}”.</li>}
        {items.map((c, i) => (
          <li key={c.symbol}>
            {(i === 0 || items[i - 1].group !== c.group) && <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">{c.group}</p>}
            <div
              role="option"
              aria-selected={c.symbol === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(c.symbol)}
              className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm", i === at && "bg-secondary", c.symbol === value && "font-bold")}
            >
              <span className="truncate">{c.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.unit}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The commodity picker, with a search box: gold, silver, oil, wheat and the rest, grouped. The value is the Yahoo symbol ("GC=F"). */
export function CommodityPicker({ id, value, onChange }: { id: string; value: string; onChange: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const c = commodityFor(value);
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
            <RollText text={c ? `${c.name} (${c.unit})` : value || "Choose a commodity"} />
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-0 rounded-none border border-border bg-popover p-0 ring-0">
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
