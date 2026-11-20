import { growthSeries } from "./charts.ts";
import { prepare } from "./exportData.ts";
import { EXAMPLES } from "./examples.ts";
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
  /** Short button text, e.g. "Bitcoin, $200 a month since 2020". */
  label: string;
  /** The question in plain words. */
  question: string;
  /** What was bought, for the sentence ("Bitcoin"). */
  name: string;
  /** How it was bought, for the sentence ("$200 a month", "$1,000 once"). */
  buying: string;
  since: string;
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

export function demoChecks(): DemoCheck[] {
  const out: DemoCheck[] = [];
  for (const ex of EXAMPLES) {
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
      label: ex.label,
      question: ex.question,
      name: FRIENDLY[ex.address] ?? r.token.name ?? ex.address,
      buying: ex.plan === "once" ? `${money(ex.amount)} once` : `${money(ex.amount)} a month`,
      since: `${MONTHS[m - 1]} ${y}`,
      invested: s.invested,
      value: s.valueToday,
      gainPct: s.gainPct,
      asOf: snap.asOf,
      points: pts.map((p) => ({ t: p.t, invested: p.invested, value: p.value })),
    });
  }
  return out;
}
