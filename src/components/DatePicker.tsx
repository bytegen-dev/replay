"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MIN_YEAR = 2010;

const pad = (n: number) => String(n).padStart(2, "0");

/** A calendar for picking one day. Only mounted while open, so reading the clock never runs during prerender. */
function Calendar({ selected, onPick }: { selected: string | null; onPick: (iso: string) => void }) {
  const today = new Date();
  const todayIso = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;
  const start = selected ?? todayIso;
  const [year, setYear] = useState(Number(start.slice(0, 4)));
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1);

  const maxYear = today.getUTCFullYear();
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => i - lead + 1);

  const step = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };
  const atMin = year === MIN_YEAR && month === 0;
  const atMax = year === maxYear && month === today.getUTCMonth();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-1">
        <Button type="button" variant="outline" size="icon-sm" className="rounded-none" aria-label="Previous month" disabled={atMin} onClick={() => step(-1)}>
          <ChevronLeft />
        </Button>
        <div className="flex gap-1">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger aria-label="Month" className="h-8 w-28 justify-center gap-1 rounded-none font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64 rounded-none border border-border bg-popover ring-0">
              {LONG.map((m, i) => (
                <SelectItem key={m} value={String(i)} disabled={year === maxYear && i > today.getUTCMonth()} className="rounded-none">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(year)}
            onValueChange={(v) => {
              const y = Number(v);
              setYear(y);
              if (y === maxYear && month > today.getUTCMonth()) setMonth(today.getUTCMonth());
            }}
          >
            <SelectTrigger aria-label="Year" className="h-8 w-20 justify-center gap-1 rounded-none font-bold tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64 rounded-none border border-border bg-popover ring-0">
              {Array.from({ length: maxYear - MIN_YEAR + 1 }, (_, i) => maxYear - i).map((y) => (
                <SelectItem key={y} value={String(y)} className="rounded-none tabular-nums">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="icon-sm" className="rounded-none" aria-label="Next month" disabled={atMax} onClick={() => step(1)}>
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground" aria-hidden>
        {WEEK.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={`${LONG[month]} ${year}`}>
        {cells.map((d, i) => {
          if (d < 1 || d > days) return <span key={i} />;
          const iso = `${year}-${pad(month + 1)}-${pad(d)}`;
          const isSel = iso === selected;
          return (
            <button
              key={i}
              type="button"
              disabled={iso > todayIso}
              aria-pressed={isSel}
              aria-label={`${d} ${LONG[month]} ${year}`}
              onClick={() => onPick(iso)}
              className={cn(
                "h-8 text-sm tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-30",
                isSel ? "bg-primary font-bold text-primary-foreground" : "hover:bg-secondary",
                iso === todayIso && !isSel && "border border-primary",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-8 flex-1 rounded-none" onClick={() => onPick(todayIso)}>
          Today
        </Button>
      </div>
    </div>
  );
}

/** A calendar button that sits inside a text field. Picking a day hands back YYYY-MM-DD, which the text field already understands. */
export function DatePickerButton({ selected, onPick }: { selected: string | null; onPick: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Open calendar" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center border-l border-input text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
          <CalendarDays className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-none border border-border bg-popover ring-0">
        <Calendar
          selected={selected}
          onPick={(iso) => {
            onPick(iso);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
