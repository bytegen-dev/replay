"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentMonth } from "@/lib/months.ts";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Default earliest year. Stocks pass an earlier one, since they have decades of history. */
const MIN_YEAR = 2015;

export function formatMonth(v: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? `${LONG[Number(m[2]) - 1]} ${m[1]}` : "";
}

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** Earliest selectable month, YYYY-MM. */
  min?: string;
  /** Latest selectable month, YYYY-MM. Defaults to the current month. */
  max?: string;
  /** Earliest year offered. Defaults to 2015. */
  minYear?: number;
  invalid?: boolean;
}

/** Only mounted while the popover is open, so reading the clock here never runs during prerender. */
function Grid({ value, onChange, min, max, minYear: floorYear = MIN_YEAR }: Pick<Props, "value" | "onChange" | "min" | "max" | "minYear">) {
  const now = currentMonth();
  const upper = max && max < now ? max : now;
  const lower = min && min > `${floorYear}-01` ? min : `${floorYear}-01`;
  const selectedYear = Number(value.slice(0, 4)) || Number(now.slice(0, 4));
  const [year, setYear] = useState(selectedYear);

  const ym = (m: number) => `${year}-${String(m + 1).padStart(2, "0")}`;
  const disabled = (m: number) => ym(m) < lower || ym(m) > upper;
  const maxYear = Number(upper.slice(0, 4));
  const minYear = Number(lower.slice(0, 4));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="icon-sm" className="rounded-none" aria-label="Previous year" disabled={year <= minYear} onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft />
        </Button>
        {/* A year list, so reaching 1998 or 2013 is one pick instead of dozens of clicks. */}
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger aria-label="Year" className="h-8 w-24 justify-center gap-1 rounded-none font-bold tabular-nums">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64 rounded-none border border-border bg-popover ring-0">
            {Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i).map((y) => (
              <SelectItem key={y} value={String(y)} className="rounded-none tabular-nums">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon-sm" className="rounded-none" aria-label="Next year" disabled={year >= maxYear} onClick={() => setYear((y) => y + 1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-1" role="group" aria-label={`Months of ${year}`}>
        {MONTHS.map((name, m) => {
          const selected = ym(m) === value;
          return (
            <Button
              key={name}
              type="button"
              variant={selected ? "default" : "outline"}
              className={cn("h-9 rounded-none border-border", !selected && "border-transparent")}
              disabled={disabled(m)}
              aria-pressed={selected}
              aria-label={`${LONG[m]} ${year}`}
              onClick={() => onChange(ym(m))}
            >
              {name}
            </Button>
          );
        })}
      </div>
      <Button type="button" variant="outline" className="h-8 rounded-none" disabled={now < lower || now > upper} onClick={() => onChange(now)}>
        This month
      </Button>
    </div>
  );
}

export function MonthPicker({ id, value, onChange, min, max, minYear, invalid }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          className="form-control-h w-full justify-between rounded-none font-normal"
        >
          <span className={value ? "" : "text-muted-foreground"}>{value ? formatMonth(value) : "Pick a month"}</span>
          <CalendarDays />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-none border border-border bg-popover ring-0">
        <Grid
          value={value}
          min={min}
          max={max}
          minYear={minYear}
          onChange={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
