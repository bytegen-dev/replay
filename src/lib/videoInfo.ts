import { planInfo, type Plan } from "./plan.ts";

/**
 * What a replay video says about the trade, and what its file is called. The video's big line names the asset and the amount, a tag
 * at its top right says what kind of trade it is (a plain buy, or leveraged long or short), and the file name carries the same facts so
 * a folder of videos can be told apart: "bitcoin-5x-long-200-monthly-2020-01-to-2026-10.webm", not "btc-200".
 */
export interface VideoInfo {
  title: string;
  /** The tag at the top right of the video. */
  subtitle: string;
  /** The file name without its extension. */
  fileName: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "monthly", "every 3 months"... as one lower-case word for a file name. */
const PLAN_WORD: Record<Plan, string> = { monthly: "monthly", quarterly: "quarterly", semiannual: "every-6-months", yearly: "yearly", once: "once" };

export function videoInfo(o: {
  /** What was bought: "Bitcoin", "Gold", "USD to EUR". */
  asset: string;
  amount: number;
  symbol?: string;
  plan?: Plan;
  /** Set for a leveraged run. */
  leverage?: { times: number; side?: "long" | "short" };
  /** Stocks only: dividends reinvested. */
  reinvest?: boolean;
  /** A currency run, not a purchase of an asset. */
  currency?: boolean;
  startMonth?: string;
  endMonth?: string;
}): VideoInfo {
  const plan = o.plan ?? "monthly";
  const sym = o.symbol ?? "$";
  const amount = `${sym}${o.amount.toLocaleString("en-US", { maximumFractionDigits: o.amount >= 100 ? 0 : 2 })}`;
  const title = `${o.asset}, ${amount} ${planInfo(plan).phrase}`;

  const lev = o.leverage && o.leverage.times > 1 ? o.leverage : null;
  const side = lev?.side ?? "long";
  const how = o.currency ? "Currency buys" : lev ? `${lev.times}x ${side}, leveraged` : plan === "once" ? "Spot, one buy" : `Spot, ${PLAN_WORD[plan] === "monthly" ? "monthly buys" : planInfo(plan).phrase}`;
  const subtitle = !lev && !o.currency && o.reinvest ? `${how}, dividends reinvested` : how;

  const kind = o.currency ? "currency" : lev ? `${lev.times}x-${side}` : "spot";
  const period = o.startMonth && o.endMonth ? `${o.startMonth}-to-${o.endMonth}` : "";
  const fileName = [slug(o.asset), kind, String(Math.round(o.amount * 100) / 100).replace(".", "-"), PLAN_WORD[plan], period].filter(Boolean).join("-") || "replay";
  return { title, subtitle, fileName };
}
