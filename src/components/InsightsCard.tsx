import { growthSeries } from "@/lib/charts.ts";
import { fmtPrice } from "@/lib/format.ts";
import { computeInsights, monthYear } from "@/lib/insights.ts";
import type { BuyRow } from "@/lib/math.ts";
import { cn } from "@/lib/utils";

/** Whole dollars: these are headline figures, so cents are noise. */
const usd0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const multiple = (m: number) => (m >= 10 ? `${m.toFixed(0)}x` : `${m.toFixed(1)}x`);

/**
 * What the run looked like from the inside: buying monthly against putting the same money in at once, then the best and
 * worst single buys, the worst fall in the price and the longest time spent below break-even. Facts about this run only.
 */
export function InsightsCard({ buys, priceToday, priceTodayDate, amount }: { buys: BuyRow[]; priceToday: number | null; priceTodayDate: string | null; amount: number }) {
  const insights = computeInsights(growthSeries(buys, priceToday, priceTodayDate), amount);
  if (!insights) return null;
  const { lumpSum, best, worst, drop, underwater } = insights;

  const monthlyWon = lumpSum.dcaMinusLump > 0.005;
  const tied = Math.abs(lumpSum.dcaMinusLump) <= 0.005;
  const top = Math.max(lumpSum.dcaValue, lumpSum.value, 1);
  const verdict = tied
    ? "Both ways end up in the same place."
    : monthlyWon
      ? `Buying monthly came out ${usd0(lumpSum.dcaMinusLump)} ahead of putting it all in at the start.`
      : `Putting it all in at the start would have been ${usd0(-lumpSum.dcaMinusLump)} better than buying monthly.`;

  const bars = [
    { key: "monthly", label: "Buying monthly", sub: "as you did", value: lumpSum.dcaValue, fill: "bg-primary" },
    { key: "lump", label: "All at once", sub: `on ${monthYear(lumpSum.date)}`, value: lumpSum.value, fill: "bg-muted-foreground/60" },
  ];

  const facts: { key: string; big: string; small: string; tone?: "up" | "down" }[] = [
    {
      key: "Best buy",
      big: monthYear(best.date),
      small: `At $${fmtPrice(best.price)}. That one buy is now worth ${usd0(best.nowValue)} (${multiple(best.multiple)}).`,
      tone: best.multiple >= 1 ? "up" : "down",
    },
    {
      key: "Worst buy",
      big: monthYear(worst.date),
      small: `At $${fmtPrice(worst.price)}. That one buy is now worth ${usd0(worst.nowValue)} (${multiple(worst.multiple)}).`,
      tone: worst.multiple >= 1 ? "up" : "down",
    },
    drop
      ? { key: "Biggest drop", big: `-${drop.pct.toFixed(0)}%`, small: `The price fell from ${monthYear(drop.from)} to ${monthYear(drop.to)}.`, tone: "down" }
      : { key: "Biggest drop", big: "None", small: "The price never fell from a high while you were buying." },
    underwater
      ? {
          key: "Longest below break-even",
          big: `${underwater.months} ${underwater.months === 1 ? "month" : "months"}`,
          small: underwater.still ? `Since ${monthYear(underwater.from)} your holding has been worth less than you put in.` : `From ${monthYear(underwater.from)} to ${monthYear(underwater.to)} your holding was worth less than you put in.`,
          tone: "down",
        }
      : { key: "Longest below break-even", big: "Never", small: "After every buy, your holding was worth at least what you had put in.", tone: "up" },
  ];

  return (
    <section className="flex flex-col gap-5 border border-border bg-card p-4 sm:p-6" aria-label="How it compares">
      <div>
        <h3 className="text-base font-bold">Monthly buys against all at once</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The same {usd0(lumpSum.invested)} in total, either spread out as you did or all put in on the first day.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {bars.map((b) => (
          <div key={b.key} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[11rem_1fr_7rem]">
            <div className="col-span-2 sm:col-span-1">
              <p className="text-sm font-bold">{b.label}</p>
              <p className="text-xs text-muted-foreground">{b.sub}</p>
            </div>
            <div className="h-6 bg-secondary">
              <div className={cn("h-full origin-left", b.fill)} style={{ width: `${Math.max(2, (b.value / top) * 100)}%`, animation: "bar-grow 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both" }} />
            </div>
            <p className="text-right text-sm font-bold tabular-nums">{usd0(b.value)}</p>
          </div>
        ))}
      </div>
      <p className="border-l-2 border-primary pl-4 text-sm">
        {verdict} <span className="text-muted-foreground">Putting it all in at once needs the cash on day one, which most people do not have.</span>
      </p>

      <div className="grid grid-cols-1 gap-px border border-border bg-border min-[560px]:grid-cols-2 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.key} className="flex flex-col gap-1 bg-card p-4">
            <p className="text-sm text-muted-foreground">{f.key}</p>
            <p className={cn("text-xl font-bold tabular-nums", f.tone === "up" && "text-primary", f.tone === "down" && "text-destructive")}>{f.big}</p>
            <p className="text-xs leading-snug text-muted-foreground">{f.small}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
