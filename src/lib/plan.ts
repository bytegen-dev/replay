/**
 * How often the money goes in. The default is every month. The same maths works for any spacing, so a plan is just a rule
 * for which months of the range are buying months, counted from the start month: every month, every 3 or 6 months, every
 * year, or once at the start.
 */

export type Plan = "monthly" | "quarterly" | "semiannual" | "yearly" | "once";

export const PLANS: { value: Plan; label: string; /** Short form, for the closed picker. */ short: string; every: number; phrase: string }[] = [
  { value: "monthly", label: "DCA: every month", short: "DCA monthly", every: 1, phrase: "a month" },
  { value: "quarterly", label: "DCA: every 3 months", short: "DCA 3 mo", every: 3, phrase: "every 3 months" },
  { value: "semiannual", label: "DCA: every 6 months", short: "DCA 6 mo", every: 6, phrase: "every 6 months" },
  { value: "yearly", label: "DCA: every year", short: "DCA yearly", every: 12, phrase: "a year" },
  { value: "once", label: "Spot: one buy at the start", short: "Spot", every: Infinity, phrase: "once" },
];

export const DEFAULT_PLAN: Plan = "monthly";
export const isPlan = (x: unknown): x is Plan => typeof x === "string" && PLANS.some((p) => p.value === x);
export const planInfo = (plan: Plan | undefined) => PLANS.find((p) => p.value === (plan ?? DEFAULT_PLAN)) ?? PLANS[0];

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

/** Whether `month` is a buying month, counting from `startMonth`. The start month always buys. */
export function isBuyMonth(plan: Plan | undefined, startMonth: string, month: string): boolean {
  const p = plan ?? DEFAULT_PLAN;
  const gap = monthIndex(month) - monthIndex(startMonth);
  if (gap < 0) return false;
  if (p === "once") return gap === 0;
  return gap % planInfo(p).every === 0;
}

/** How many buying months a range has under a plan. */
export function countBuys(plan: Plan | undefined, startMonth: string, endMonth: string): number {
  const span = monthIndex(endMonth) - monthIndex(startMonth) + 1;
  if (span <= 0) return 0;
  const p = plan ?? DEFAULT_PLAN;
  return p === "once" ? 1 : Math.ceil(span / planInfo(p).every);
}

/** "$500 a month for 120 months", "$500 every 3 months for 40 buys" or "$500 once". Used in every sentence that states the plan. */
export function describePlan(plan: Plan | undefined, amountText: string, priced: number, total: number, skipped: number): string {
  const info = planInfo(plan);
  if (plan === "once") return `${amountText} once`;
  const unit = plan && plan !== "monthly" ? "buy" : "month";
  const count = skipped > 0 ? `${priced} of ${total} ${unit}s` : `${priced} ${priced === 1 ? unit : `${unit}s`}`;
  return `${amountText} ${info.phrase} for ${count}`;
}
