import { growthSeries } from "./charts.ts";
import { prepare } from "./exportData.ts";
import { EXAMPLES, FX_EXAMPLES, HERO_CHECKS, type Example, type ExampleGroup } from "./examples.ts";
import fxSaved from "../data/fxExampleResults.json" with { type: "json" };
import type { FxDcaResult } from "./fxDca.ts";
import { exampleSnapshot } from "./exampleResults.ts";

/**
 * The ready-made checks, worked out ahead of time, shaped for the landing page: the money in, what it was worth, and the path
 * between them as plain points. Computed on the server from the saved results, so the page ships numbers, not a calculator.
 */

export interface DemoPoint {
  t: number;
  invested: number;
  value: number;
}

export interface DemoCheck {
  id: string;
  /** Which tab of the landing demo it belongs to. */
  group: ExampleGroup;
  /** Short button text, e.g. "Bitcoin, $200 a month since 2020". */
  label: string;
  /** The question in plain words. */
  question: string;
  /** What was bought, for the sentence ("Bitcoin"). */
  name: string;
  /** How it was bought, for the sentence ("$200 a month", "$1,000 once"). */
  buying: string;
  since: string;
  /** "since January 2020" for a monthly habit, "in November 2021" for a single buy. */
  timing: string;
  invested: number;
  value: number;
  gainPct: number;
  /** The day the saved result was worked out. */
  asOf: string;
  points: DemoPoint[];
}

/** Fund tickers read better as what they track. */
const FRIENDLY: Record<string, string> = { SPY: "the S&P 500 (SPY)", QQQ: "the Nasdaq-100 (QQQ)" };

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function build(list: Example[]): DemoCheck[] {
  const out: DemoCheck[] = [];
  for (const ex of list) {
    const snap = exampleSnapshot(ex.id);
    if (!snap) continue;
    const r = snap.response;
    const prepared = prepare({
      tokenLabel: r.token.symbol ?? "",
      chain: r.chain,
      address: r.address,
      basis: r.basis,
      amount: ex.amount,
      currentPrice: r.currentPrice,
      currentPriceDate: r.currentPriceDate,
      rows: r.rows,
      overrides: {},
      sources: r.sources,
      unit: "tokens",
      ...(ex.plan ? { plan: ex.plan } : {}),
    });
    const s = prepared.summary;
    const pts = growthSeries(prepared.buys, r.currentPrice, r.currentPriceDate);
    if (!pts.length || s.valueToday === null || s.gainPct === null) continue;
    const [y, m] = ex.startMonth.split("-").map(Number);
    out.push({
      id: ex.id,
      group: ex.group ?? "stocks",
      label: ex.label,
      question: ex.question,
      name: FRIENDLY[ex.address] ?? r.token.name ?? ex.address,
      buying: ex.plan === "once" ? `${money(ex.amount)} once` : `${money(ex.amount)} a month`,
      since: `${MONTHS[m - 1]} ${y}`,
      timing: ex.plan === "once" ? `in ${MONTHS[m - 1]} ${y}` : `since ${MONTHS[m - 1]} ${y}`,
      invested: s.invested,
      value: s.valueToday,
      gainPct: s.gainPct,
      asOf: snap.asOf,
      points: pts.map((p) => ({ t: p.t, invested: p.invested, value: p.value })),
    });
  }
  return out;
}

/** The currency examples (US dollars spent each month on another currency), worked out ahead of time, shaped the same way. */
function buildFx(): DemoCheck[] {
  const out: DemoCheck[] = [];
  for (const ex of FX_EXAMPLES) {
    const snap = (fxSaved as Record<string, { asOf: string; result: FxDcaResult } | undefined>)[ex.id];
    if (!snap) continue;
    const r = snap.result;
    if (r.valueToday === null || r.gainPct === null || r.rateToday === null) continue;
    // The holding, month by month: what was spent so far and what the units bought so far are worth at that month's rate.
    let invested = 0;
    let held = 0;
    const points: DemoPoint[] = [];
    for (const row of r.rows) {
      if (row.rate === null || row.bought === null) continue;
      invested += ex.amount;
      held += row.bought;
      points.push({ t: Date.parse(`${row.date}T00:00:00Z`), invested, value: held * row.rate });
    }
    if (points.length < 2) continue;
    const [y, m] = ex.startMonth.split("-").map(Number);
    out.push({
      id: ex.id,
      group: "currencies",
      label: ex.label,
      question: ex.question,
      name: ex.toName,
      buying: `${money(ex.amount)} a month`,
      since: `${MONTHS[m - 1]} ${y}`,
      timing: `since ${MONTHS[m - 1]} ${y}`,
      invested: r.spent,
      value: r.valueToday,
      gainPct: r.gainPct,
      asOf: snap.asOf,
      points,
    });
  }
  return out;
}

/**
 * The ready-made checks shown in the landing page's demo, under four tabs (stocks, crypto, currencies, commodities). A tab with no
 * saved result yet is simply empty: the saved results come from scripts/update-examples.mjs.
 */
export const demoChecks = (): DemoCheck[] => [...build(EXAMPLES), ...build(HERO_CHECKS.filter((e) => e.id === "hero-ada")), ...buildFx()];

/** The five the hero card turns through: three that gained and two that lost. */
export const heroChecks = (): DemoCheck[] => build(HERO_CHECKS);
