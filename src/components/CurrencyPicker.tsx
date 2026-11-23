"use client";

import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { RollText } from "@/components/RollText";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { currencyByCode, filterCurrencies, flagFor } from "@/lib/fxCurrencies.ts";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  value: string;
  onChange: (code: string) => void;
  /** "full" shows the flag, code and name; "compact" shows the flag and code only, for the box beside an amount. */
  variant?: "full" | "compact";
  /** Called when the list is opened, for a caller that wants opening the picker to count as choosing the value it shows. */
  onOpen?: () => void;
  ariaLabel?: string;
  className?: string;
}

function List({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const items = useMemo(() => filterCurrencies(query), [query]);
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
              if (items[at]) onPick(items[at].code);
            }
          }}
          placeholder="Search by name or code"
          aria-label="Search currencies"
          role="combobox"
          aria-expanded
          aria-controls="currency-options"
          autoComplete="off"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <ul id="currency-options" role="listbox" className="max-h-64 overflow-y-auto py-1">
        {items.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No currency matches “{query.trim()}”.</li>}
        {items.map((c, i) => (
          <li
            key={c.code}
            role="option"
            aria-selected={c.code === value}
            ref={(el) => {
              if (el && i === at) el.scrollIntoView({ block: "nearest" });
            }}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(c.code)}
            className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm", i === at && "bg-secondary", c.code === value && "font-bold")}
          >
            <span aria-hidden className="w-5 shrink-0 text-base leading-none">
              {flagFor(c.code)}
            </span>
            <span className="w-9 shrink-0 font-bold">{c.code}</span>
            <span className="truncate text-muted-foreground">{c.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CurrencyPicker({ id, value, onChange, onOpen, variant = "full", ariaLabel, className }: Props) {
  const [open, setOpen] = useState(false);
  const cur = currencyByCode(value);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) onOpen?.();
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "form-control-h flex items-center justify-between gap-2 border border-input bg-transparent px-3 text-sm outline-none hover:border-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            variant === "full" ? "w-full" : "px-2",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="text-base leading-none">
              {flagFor(value)}
            </span>
            <RollText text={value} />
            {variant === "full" && <RollText text={cur?.name ?? ""} className="truncate text-muted-foreground" />}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] gap-0 rounded-none border border-border bg-popover p-0 ring-0">
        <List
          value={value}
          onPick={(code) => {
            onChange(code);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
