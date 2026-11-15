"use client";

import { ExternalLink, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtPrice, NA } from "@/lib/format.ts";
import type { TokenInfo } from "@/lib/tokenInfo.ts";
import { CHAIN_LABELS, type Chain } from "@/lib/types.ts";
import { normalizeAddress, validateAddress } from "@/lib/validate.ts";

type Result = { key: string; status: "ok"; info: TokenInfo } | { key: string; status: "none" | "error"; message: string };

// Remembered for the page's lifetime so retyping or switching back doesn't refetch.
const cache = new Map<string, Result>();
const DEBOUNCE_MS = 450;

const compact = (n: number | null) => (n === null ? NA : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n));
const usd = (n: number | null) => (n === null ? NA : `$${compact(n)}`);

function hideBroken(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}

/** Looks the token up as soon as the address is valid, so mistakes show before you calculate. */
export function TokenDetails({ chain, address }: { chain: Chain; address: string }) {
  const valid = address.trim() !== "" && validateAddress(address, chain) === null;
  const key = valid ? `${chain}:${normalizeAddress(address, chain)}` : null;
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    if (!key) return;
    const hit = cache.get(key);
    const controller = new AbortController();
    const id = setTimeout(
      async () => {
        if (hit) return setRes(hit);
        const [c, a] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
        let out: Result;
        try {
          const r = await fetch(`/api/token-info?chain=${c}&address=${encodeURIComponent(a)}`, { signal: controller.signal });
          const j = await r.json().catch(() => null);
          if (r.ok) out = { key, status: "ok", info: j.info as TokenInfo };
          else if (r.status === 404) out = { key, status: "none", message: j?.error ?? "No details found for this address." };
          else out = { key, status: "error", message: j?.error ?? "Couldn't load token details." };
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          out = { key, status: "error", message: "Couldn't load token details." };
        }
        if (out.status !== "error") cache.set(key, out);
        setRes(out);
      },
      hit ? 0 : DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [key]);

  if (!key) return null;
  const cur = res?.key === key ? res : null;

  if (!cur) {
    return (
      <div className="flex flex-col gap-3 border border-border bg-card p-4 sm:p-6" aria-busy="true" aria-label="Loading token details">
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-none" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40 rounded-none" />
            <Skeleton className="h-4 w-24 rounded-none" />
          </div>
        </div>
        <Skeleton className="h-4 w-full max-w-xl rounded-none" />
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-none" />
          ))}
        </div>
      </div>
    );
  }

  if (cur.status !== "ok") {
    return (
      <p role="status" className="flex items-start gap-2 border border-border p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {cur.message}
      </p>
    );
  }

  const t = cur.info;
  const stats = [
    { k: "Market cap", v: usd(t.marketCap), show: t.marketCap !== null },
    { k: "Fully diluted value", v: usd(t.fdv), show: t.fdv !== null },
    { k: "Liquidity", v: usd(t.liquidityUsd), show: t.liquidityUsd !== null, sub: t.poolCount ? `${t.poolCount} ${t.poolCount === 1 ? "pool" : "pools"}` : undefined },
    { k: "24h volume", v: usd(t.volume24h), show: t.volume24h !== null },
    { k: "Circulating supply", v: compact(t.circulatingSupply), show: t.circulatingSupply !== null },
    { k: "Total supply", v: compact(t.totalSupply), show: t.totalSupply !== null },
    { k: "Max supply", v: compact(t.maxSupply), show: t.maxSupply !== null },
    { k: "CoinGecko rank", v: t.rank === null ? NA : `#${t.rank.toLocaleString("en-US")}`, show: t.rank !== null },
  ].filter((s) => s.show);

  return (
    <section aria-label="Token details" className="overflow-hidden border border-border bg-card">
      {t.banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.banner} alt="" referrerPolicy="no-referrer" loading="lazy" onError={hideBroken} className="h-24 w-full border-b border-border object-cover sm:h-32" />
      )}
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          {t.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo} alt="" width={56} height={56} referrerPolicy="no-referrer" loading="lazy" onError={hideBroken} className="size-12 shrink-0 border border-border object-cover sm:size-14" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight break-words sm:text-xl">{t.name ?? "Unknown token"}</h2>
              {t.symbol && <span className="text-sm text-muted-foreground">{t.symbol}</span>}
              <Badge variant="outline" className="rounded-none font-normal">
                {CHAIN_LABELS[chain]}
              </Badge>
            </div>
            {t.priceUsd !== null && (
              <p className="mt-1 text-sm tabular-nums">
                <span className="font-bold">${fmtPrice(t.priceUsd)}</span>
                {t.change24h !== null && (
                  <span className="ml-2 text-muted-foreground">
                    {t.change24h >= 0 ? "+" : ""}
                    {t.change24h.toFixed(2)}% in 24h
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {t.description && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.description}</p>}

        {stats.length > 0 && (
          <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.k} className="flex flex-col gap-0.5 bg-card p-3">
                <dt className="text-xs text-muted-foreground">{s.k}</dt>
                <dd className="text-base font-bold tabular-nums">
                  {s.v}
                  {s.sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{s.sub}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {t.links.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {t.links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-9 items-center gap-1.5 border border-border px-3 text-sm hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {l.label}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <p>
            Live snapshot, refreshed at most every few minutes. Data from{" "}
            {t.sources.length
              ? t.sources.map((s, i) => (
                  <span key={s.url}>
                    {i > 0 && " and "}
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-foreground">
                      {s.label}
                    </a>
                  </span>
                ))
              : "public sources"}
            .
          </p>
        </div>
      </div>
    </section>
  );
}
