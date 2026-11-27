"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Anonymous page-view counts through Vercel Web Analytics: no cookies, and nothing that follows a person from site to site. What is sent is cut down first: the
 * address of a page without its query string or anything after a #, so a wallet or a token typed into a link (/recap?wallet=...) never leaves the page.
 */
export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        try {
          const url = new URL(event.url);
          url.search = "";
          url.hash = "";
          return { ...event, url: url.toString() };
        } catch {
          return null;
        }
      }}
    />
  );
}
