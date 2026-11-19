"use client";

import { ChevronDown, Globe, LocateFixed, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Zone {
  id: string;
  /** "Africa/Lagos" -> "Lagos" */
  city: string;
  region: string;
  /** "GMT+1" right now, so daylight saving shows. */
  offset: string;
}

let cache: Zone[] | null = null;

/** Every IANA zone the browser knows, with its current offset. Built once, only when the picker is first opened. */
function zones(): Zone[] {
  if (cache) return cache;
  const ids = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["Africa/Lagos", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];
  const now = new Date();
  cache = ids
    .filter((id) => id.includes("/"))
    .map((id) => {
      let offset = "";
      try {
        offset = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "shortOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "";
      } catch {
        /* a zone this browser can't format keeps an empty offset */
      }
      const [region, ...rest] = id.split("/");
      return { id, city: rest.join(" / ").replace(/_/g, " "), region: region.replace(/_/g, " "), offset: offset === "GMT" ? "GMT+0" : offset };
    });
  return cache;
}

const UTC: Zone = { id: "", city: "UTC", region: "Coordinated Universal Time", offset: "GMT+0" };

export function offsetFor(id: string): string {
  if (!id) return "GMT+0";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function List({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const mine = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  const items = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, " ");
    const all = [UTC, ...zones()];
    if (!q) return all;
    const score = (z: Zone) => {
      const city = z.city.toLowerCase();
      const hay = `${z.id} ${z.region} ${z.city} ${z.offset}`.toLowerCase();
      if (city === q) return 0;
      if (city.startsWith(q)) return 1;
      if (city.split(" ").some((w) => w.startsWith(q))) return 2;
      if (hay.replace(/_/g, " ").includes(q)) return 3;
      return 9;
    };
    return all
      .map((z) => [z, score(z)] as const)
      .filter(([, s]) => s < 9)
      .sort((a, b) => a[1] - b[1])
      .map(([z]) => z);
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
              if (items[at]) onPick(items[at].id);
            }
          }}
          placeholder="Search a city or offset"
          aria-label="Search timezones"
          autoComplete="off"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {mine && !query && (
        <button type="button" onClick={() => onPick(mine)} className="flex items-center gap-2 border-b border-border px-3 py-2 text-left text-sm hover:bg-secondary">
          <LocateFixed className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Use my timezone</span>
          <span className="text-xs text-muted-foreground">
            {mine.split("/").pop()?.replace(/_/g, " ")} {offsetFor(mine)}
          </span>
        </button>
      )}
      <ul role="listbox" aria-label="Timezones" className="max-h-64 overflow-y-auto py-1">
        {items.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No timezone matches “{query.trim()}”.</li>}
        {items.map((z, i) => (
          <li
            key={z.id || "utc"}
            role="option"
            aria-selected={z.id === value}
            ref={(el) => {
              if (el && i === at && query) el.scrollIntoView({ block: "nearest" });
            }}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(z.id)}
            className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm", i === at && "bg-secondary", z.id === value && "font-bold")}
          >
            <span className="min-w-0 flex-1 truncate">
              {z.city}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{z.region}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{z.offset}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A timezone selector with a search box. Empty means UTC, which is what the lookup assumes when no zone is given. */
export function TimezonePicker({ id, value, onChange }: { id: string; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = value ? (value.includes("/") ? value.split("/").pop()!.replace(/_/g, " ") : value) : "UTC";
  const offset = value && !/^utc|^gmt|^[+-]/i.test(value) ? offsetFor(value) : "";
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
            <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{label}</span>
            {offset && <span className="shrink-0 text-xs text-muted-foreground">{offset}</span>}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 rounded-none border border-border bg-popover p-0 ring-0">
        <List
          value={value}
          onPick={(z) => {
            onChange(z);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
