import type { Metadata } from "next";

/**
 * What the site says about itself, in one place, so the page titles, the search listing, the link previews and the app manifest
 * all use the same words.
 */

export const SITE_NAME = "Replay";
export const TAGLINE = "A time machine for your money";
/** The default description (search results, link previews). Under 160 characters. */
export const DESCRIPTION = "See what a stock, coin or currency buy from the past would be worth today, or its price on any day. Real daily prices, no sign-up to try.";
/** The line under the brand line on the landing page and the share image: what Replay does for you now. */
export const HERO_DESCRIPTION = "See what your wallet missed, then let a CoTrader watch the next trade. Reads only, never trades.";
/** The line the landing page and the share image open with. */
export const BRAND_LINE = "You can't change the past. You can learn from it.";
/** Where people find the project. */
export const X_HANDLE = "@bytegen_dev";

export const KEYWORDS = ["historical stock prices", "crypto price history", "what if I had invested", "dollar cost averaging calculator", "investment backtest", "price on a past date", "market cap history"];

/**
 * The metadata for one page: its search title and description, its canonical address, and its link-preview tags. A page's
 * own openGraph and twitter replace the site-wide ones rather than adding to them, so each page needs the whole set
 * (site name, type, card size), and this gives every page the same one.
 */
export function pageMeta(o: { title: string; description: string; path: string; /** The <title>, when it should differ from the social title. */ fullTitle?: string }): Metadata {
  return {
    title: { absolute: o.fullTitle ?? o.title },
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: { type: "website", locale: "en_US", siteName: SITE_NAME, title: o.title, description: o.description, url: o.path },
    twitter: { card: "summary_large_image", site: X_HANDLE, creator: X_HANDLE, title: o.title, description: o.description },
  };
}

/** Where the CoTrader app is when nothing is set. */
export const DEFAULT_APP_URL = "https://app.replay.money";

/** The address of the CoTrader app from what was set: an http or https address without a trailing slash, else the default. */
export function appUrlFrom(raw: string | undefined): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(v) ? v : DEFAULT_APP_URL;
}

/** The CoTrader app, a separate site from this one. Set NEXT_PUBLIC_APP_URL to change it. */
export const APP_URL = appUrlFrom(process.env.NEXT_PUBLIC_APP_URL);
