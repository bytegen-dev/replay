"use client";

import { RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isFiltered, NO_FILTER, yearsIn, type MonthFilter, type ResultFilter, type SortKey } from "@/lib/monthFilters.ts";
import type { BuyRow } from "@/lib/math.ts";
import { cn } from "@/lib/utils";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "month-asc", label: "Oldest first" },
  { value: "month-desc", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "value-desc", label: "Worth the most today" },
];
const RESULTS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "profit", label: "In profit" },
  { value: "loss", label: "At a loss" },
];

/** A toggle chip. Pressed chips are filled mint. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("h-8 border px-3 text-xs sm:text-sm", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground")}>
      {children}
    </button>
  );
}

/** Controls for which months the list shows and in what order. They never change the totals. */
export function MonthFilterBar({ buys, filter, onChange, shown }: { buys: BuyRow[]; filter: MonthFilter; onChange: (f: MonthFilter) => void; shown: number }) {
  const set = (p: Partial<MonthFilter>) => onChange({ ...filter, ...p });
  const years = yearsIn(buys);
  const missing = buys.filter((b) => b.tokens === null).length;
  const withNotes = buys.filter((b) => b.notes.length > 0).length;
  const edited = buys.filter((b) => b.manual).length;
  const selectContent = "rounded-none border border-border bg-popover ring-0";

  return (
    <section aria-label="Filter the months" className="flex flex-col gap-4 border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold">Months</h3>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing {shown} of {buys.length}. Totals always use every month.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {missing > 0 && (
          <Chip on={filter.hideNoPrice} onClick={() => set({ hideNoPrice: !filter.hideNoPrice })}>
            Hide months with no price ({missing})
          </Chip>
        )}
        {withNotes > 0 && (
          <Chip on={filter.onlyNotes} onClick={() => set({ onlyNotes: !filter.onlyNotes })}>
            Only months with notes ({withNotes})
          </Chip>
        )}
        {edited > 0 && (
          <Chip on={filter.onlyEdited} onClick={() => set({ onlyEdited: !filter.onlyEdited })}>
            Only prices I edited ({edited})
          </Chip>
        )}
        <div role="group" aria-label="Result of each buy" className="flex">
          {RESULTS.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={filter.result === r.value}
              onClick={() => set({ result: r.value })}
              className={cn("h-8 border px-3 text-xs not-first:-ml-px sm:text-sm", filter.result === r.value ? "z-10 border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[8rem_1fr_1fr_14rem_auto]">
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          Year
          <Select value={filter.year} onValueChange={(v) => set({ year: v })}>
            <SelectTrigger className="form-control-h w-full rounded-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContent}>
              <SelectItem value="all" className="rounded-none">
                All years
              </SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y} className="rounded-none">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          Price from
          <Input inputMode="decimal" placeholder="Any" value={filter.minPrice} onChange={(e) => set({ minPrice: e.target.value })} className="form-control-h text-sm" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          Price to
          <Input inputMode="decimal" placeholder="Any" value={filter.maxPrice} onChange={(e) => set({ maxPrice: e.target.value })} className="form-control-h text-sm" autoComplete="off" />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 text-sm text-muted-foreground sm:col-span-1">
          Order
          <Select value={filter.sort} onValueChange={(v) => set({ sort: v as SortKey })}>
            <SelectTrigger className="form-control-h w-full rounded-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContent}>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value} className="rounded-none">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <button
          type="button"
          disabled={!isFiltered(filter)}
          onClick={() => onChange(NO_FILTER)}
          className="form-control-h col-span-2 flex items-center justify-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40 sm:col-span-1"
        >
          <RotateCcw className="size-4" aria-hidden />
          Reset
        </button>
      </div>
    </section>
  );
}
