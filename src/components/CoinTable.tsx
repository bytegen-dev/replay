"use client";

import { Eye, EyeOff, Share } from "lucide-react";
import { useRef, useState } from "react";
import { Hint } from "@/components/Hint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { coinMoney, compactAmount, type CoinPart, type CoinRow } from "@/lib/fumble/coins.ts";
import type { Display } from "@/lib/fumble/money.ts";
import { figure } from "@/lib/fumble/money.ts";
import type { ApiTrades } from "@/lib/fumble/service.ts";
import { agoShort, explorerUrl, tokenLabel } from "@/lib/fumble/view.ts";
import { useDragScroll } from "@/lib/dragScroll.ts";
import type { HideMode } from "@/lib/fumble/settings.ts";
import { cn } from "@/lib/utils";

const when = (t: number) => new Date(t * 1000).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The trades by coin, in the same table the Wayback results use: a bordered box, a header that stays put, striped rows, and a first column that
 * stays put when it scrolls sideways. One row per coin: what was bought and sold (money, with the token amounts under), the average entry and exit,
 * what is left, the PnL and the total fumble, and two buttons: hide the coin, and share its PnL as a picture. On a phone the table scrolls sideways, with the token column staying put.
 */
export function CoinTable({ coins, tokens, done, display, now, hiddenCount, onHide, onShowHidden, onShare, pnlMode = "show", roundtripMode = "show", fumbleMode = "show" }: {
  coins: CoinRow[];
  tokens: ApiTrades["tokens"];
  /** The scan has finished: the fumble column can say what it found, and an unworked profit is unknown rather than still coming. */
  done: boolean;
  display: Display;
  /** The time the page is measured from, in seconds, for "x ago". */
  now: number;
  /** How many coins are hidden from this list, and the way to bring them back. */
  hiddenCount: number;
  onHide: (mint: string) => void;
  onShowHidden: () => void;
  onShare: (coin: CoinRow) => void;
  /** What to do with the PnL, Roundtripped and Fumbled columns: show the figures, draw them as ***, or leave the column out. */
  pnlMode?: HideMode;
  roundtripMode?: HideMode;
  fumbleMode?: HideMode;
}) {
  const box = useRef<HTMLElement>(null);
  // A mouse can drag the table sideways, as a finger does.
  useDragScroll(box, '[data-slot="table-container"]', coins.length > 0);
  const head = "sticky top-0 z-10 bg-card text-sm text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]";
  const hidden =
    hiddenCount > 0 ? (
      <p className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
        <Eye className="size-4" aria-hidden /> {hiddenCount} hidden {hiddenCount === 1 ? "coin" : "coins"}.
        <button type="button" onClick={onShowHidden} className="font-bold text-foreground underline underline-offset-4 hover:text-primary">
          Show
        </button>
      </p>
    ) : null;
  if (coins.length === 0)
    return (
      <section aria-label="Trades" className="border border-border bg-background/80 backdrop-blur-xl">
        {/* Nothing is "no trades" until the scan has finished: while it is still reading, say so. */}
        {done ? <p className="px-4 py-4 text-sm text-muted-foreground">No trades of 0.1 SOL or more to show.</p> : <p className="animate-pulse px-4 py-4 text-sm text-muted-foreground">Reading trades&hellip;</p>}
        {hidden}
      </section>
    );
  return (
    <section ref={box} aria-label="Trades" className="overflow-x-auto border border-border bg-background/80 backdrop-blur-xl">
      <Table className="min-w-[900px]" containerClassName="cursor-grab overflow-x-auto">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "left-0 z-20 shadow-[inset_0_-1px_0_var(--border),inset_-1px_0_0_var(--border)]")}>Token</TableHead>
            <TableHead className={cn(head, "text-right")}>Bought</TableHead>
            <TableHead className={cn(head, "text-right")}>Sold</TableHead>
            <TableHead className={cn(head, "text-right")}>Avg entry</TableHead>
            <TableHead className={cn(head, "text-right")}>Avg exit</TableHead>
            <TableHead className={cn(head, "text-right")}>Balance</TableHead>
            {pnlMode !== "hide" && <TableHead className={cn(head, "text-right")}>PnL</TableHead>}
            {roundtripMode !== "hide" && <TableHead className={cn(head, "text-right")}>Roundtripped</TableHead>}
            {fumbleMode !== "hide" && <TableHead className={cn(head, "text-right")}>Fumbled</TableHead>}
            <TableHead className={cn(head, "text-right")}>Opened</TableHead>
            <TableHead className={cn(head, "text-right")}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coins.map((c) => {
            const label = tokenLabel(c.mint, tokens);
            const m = coinMoney(c, display);
            return (
              <TableRow key={c.mint} className="align-top odd:bg-muted/40 hover:bg-muted/60">
                <TableCell className="sticky left-0 z-[5] max-w-[8.5rem] bg-card sm:max-w-[13rem] whitespace-nowrap shadow-[inset_-1px_0_0_var(--border)]">
                  <Token mint={c.mint} ticker={label.ticker} name={label.name} image={label.image} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Amount main={m.bought} under={`${compactAmount(c.boughtTokens)} ${label.ticker}`} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">{c.soldTokens > 0 ? <Amount main={m.sold} under={`${compactAmount(c.soldTokens)} ${label.ticker}`} /> : <Dash />}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{m.entry}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{c.soldTokens > 0 ? m.exit : <Dash />}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Balance coin={c} ticker={label.ticker} />
                </TableCell>
                {pnlMode !== "hide" && (
                  <TableCell className="text-right whitespace-nowrap">
                    <Pnl coin={c} display={display} done={done} hide={pnlMode === "mask"} />
                  </TableCell>
                )}
                {roundtripMode !== "hide" && (
                  <TableCell className="text-right whitespace-nowrap">
                    <Part coin={c} part={c.roundtrip} noun="positions" display={display} done={done} hide={roundtripMode === "mask"} />
                  </TableCell>
                )}
                {fumbleMode !== "hide" && (
                  <TableCell className="text-right whitespace-nowrap">
                    <Part coin={c} part={c.fumble} noun="sells" display={display} done={done} hide={fumbleMode === "mask"} />
                  </TableCell>
                )}
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  <Hint text={`Position opened on ${when(c.firstAt)}`}>{agoShort(c.firstAt, now)}</Hint>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Actions onHide={() => onHide(c.mint)} onShare={() => onShare(c)} label={label.ticker} canShare={c.soldTokens > 0} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {hidden}
    </section>
  );
}

const Dash = () => <span className="text-muted-foreground">&mdash;</span>;

/** The coin's picture, or its first letter in a box when there is none or it does not load. */
function CoinIcon({ src, ticker }: { src?: string; ticker: string }) {
  const [failed, setFailed] = useState(false);
  const box = "size-8 shrink-0 border border-border bg-secondary";
  if (!src || failed)
    return (
      <span aria-hidden className={cn(box, "grid place-items-center text-xs font-bold text-muted-foreground")}>
        {ticker.charAt(0).toUpperCase()}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- a small picture from Helius's own image address, nothing for the image optimiser to do
  return <img src={src} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn(box, "object-cover")} />;
}

function Token({ mint, ticker, name, image }: { mint: string; ticker: string; name: string | null; image?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <CoinIcon src={image} ticker={ticker} />
      <span className="flex min-w-0 flex-col">
      <a href={explorerUrl(mint)} target="_blank" rel="noreferrer" className="w-fit font-bold underline-offset-4 hover:text-primary hover:underline" title={mint}>
        {ticker}
      </a>
      {name && <span className="truncate text-xs text-muted-foreground">{name}</span>}
      </span>
    </span>
  );
}

/** Money on top and what it bought or sold under it, as Axiom writes it. */
function Amount({ main, under }: { main: string; under: string }) {
  return (
    <>
      <span className="block font-bold tabular-nums">{main}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">{under}</span>
    </>
  );
}

function Balance({ coin, ticker }: { coin: CoinRow; ticker: string }) {
  if (coin.balance > 0) return <span className="tabular-nums">{compactAmount(coin.balance)} {ticker}</span>;
  return <span className="text-muted-foreground" title={coin.partial ? "Sold more than the buys read show: the rest was bought before this window, or received another way (an airdrop or transfer)." : undefined}>Sold all</span>;
}

function Pnl({ coin, display, done, hide }: { coin: CoinRow; display: Display; done: boolean; hide: boolean }) {
  if (coin.soldTokens === 0) return <span className="text-muted-foreground">Open</span>;
  if (coin.costUnknown)
    return (
      <span className="text-muted-foreground" title="No buy was found for the coins sold, so what they cost is not known: bought before this window, or received another way (an airdrop or transfer).">
        Cost unknown
      </span>
    );
  if (coin.profitSol === null) return done ? <Dash /> : <span className="animate-pulse text-muted-foreground" title="Waiting for the rest of the history">&hellip;</span>;
  // A figure the visitor chose to hide is ***, with no colour, percent or second line.
  if (hide) return <span className="block font-bold tabular-nums text-muted-foreground">***</span>;
  const fig = coinMoney(coin, display).profit!;
  const gain = coin.profitSol >= 0;
  return (
    <>
      <span className={cn("block font-bold tabular-nums", gain ? "text-primary" : "text-destructive")}>
        {fig.main}
        {coin.profitPct !== null && <span className="ml-1.5 text-xs">({coin.profitPct >= 0 ? "+" : "-"}{Math.abs(coin.profitPct * 100).toFixed(1)}%)</span>}
      </span>
      {fig.sub && <span className="block text-xs whitespace-nowrap text-muted-foreground">{fig.sub}</span>}
    </>
  );
}

/**
 * One coin's fumble (the upside missed after its sells) or roundtrip (the profit its closed positions gave back), in words where there is no figure:
 * "Open" while nothing is sold or closed, "Pricing" while prices come, "Not priced" when none could be found, "None" when it came to nothing. A figure
 * that only some of the sells or positions could be priced for says how many, under it.
 */
function Part({ coin, part, noun, display, done, hide }: { coin: CoinRow; part: CoinPart | null; noun: string; display: Display; done: boolean; hide: boolean }) {
  const word = (text: string) => <span className="text-muted-foreground">{text}</span>;
  if (coin.soldTokens === 0) return word("Open");
  if (!part) return done ? word("Not priced") : <span className="animate-pulse text-muted-foreground">Pricing</span>;
  if (part.of === 0) return word(coin.balance > 0 ? "Open" : "None");
  if (part.done === 0) return word("Not priced");
  if (part.sol <= 0) return word("None");
  if (hide) return <span className="block font-bold tabular-nums text-muted-foreground">***</span>;
  const f = figure(display, part.sol, part.usd === null || part.usd === 0 ? null : part.usd);
  return (
    <>
      <span className="block font-bold tabular-nums text-destructive">{f.main}</span>
      {f.sub && <span className="block text-xs whitespace-nowrap text-muted-foreground">{f.sub}</span>}
      {part.done < part.of && <span className="block text-xs whitespace-nowrap text-muted-foreground">{part.done} of {part.of} {noun} priced</span>}
    </>
  );
}

function Actions({ onHide, onShare, label, canShare }: { onHide: () => void; onShare: () => void; label: string; canShare: boolean }) {
  const btn = "inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={onHide} className={btn} aria-label={`Hide ${label}`} title="Hide this coin">
        <EyeOff className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={onShare} disabled={!canShare} className={btn} aria-label={`Share ${label}`} title={canShare ? "Share this trade's PnL as a picture" : "Nothing sold yet, so there is no PnL to share"}>
        <Share className="size-4" aria-hidden />
      </button>
    </span>
  );
}
