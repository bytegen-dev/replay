import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Market } from "@/lib/types.ts";

/**
 * Chain and coin logos. They are the logos each project publishes (as served by CoinGecko), saved in /public/logos so
 * nothing loads from a third party while the page is open. Stock keeps a small chart icon, since it is not a chain.
 */
const FILES: Record<Exclude<Market, "equity">, string> = {
  ethereum: "ethereum.png",
  solana: "solana.png",
  base: "base.png",
  bsc: "bsc.png",
  arbitrum: "arbitrum.png",
  hyperevm: "hyperevm.jpg",
  cardano: "cardano.jpg",
};

const COIN_FILES: Record<string, string> = {
  "BTC-USD": "btc.png",
  "ETH-USD": FILES.ethereum,
  "BNB-USD": FILES.bsc,
  "XRP-USD": "xrp.png",
  "SOL-USD": FILES.solana,
  "ADA-USD": FILES.cardano,
  "DOGE-USD": "doge.png",
  "LTC-USD": "ltc.png",
  "LINK-USD": "link.png",
  "AVAX-USD": "avax.png",
};

function Logo({ file, className, mono }: { file: string; className: string; mono: boolean }) {
  return <Image src={`/logos/${file}`} alt="" width={24} height={24} unoptimized aria-hidden className={cn("chain-logo rounded-full object-cover", className, mono && "grayscale opacity-70")} />;
}

export function ChainLogo({ chain, className = "size-4 shrink-0", mono = false }: { chain: Market; className?: string; mono?: boolean }) {
  if (chain === "equity") {
    return (
      <svg viewBox="0 0 24 24" className={cn("chain-logo", className)} aria-hidden focusable={false} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3.5 3.5v17h17M7 15l4-4.5 3 3L20 7" />
      </svg>
    );
  }
  return <Logo file={FILES[chain]} className={className} mono={mono} />;
}

/** A major coin's logo, by its Yahoo ticker. */
export function CoinLogo({ symbol, className = "size-4 shrink-0" }: { symbol: string; className?: string }) {
  const file = COIN_FILES[symbol];
  return file ? <Logo file={file} className={className} mono={false} /> : <span className={cn("chain-logo inline-block rounded-full bg-muted", className)} aria-hidden />;
}
