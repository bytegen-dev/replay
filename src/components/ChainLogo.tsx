import type { Market } from "@/lib/types.ts";

/**
 * Small one-colour marks for each chain, drawn inline so they need no image files and follow the text colour
 * (white on the dark theme). They are simplified shapes, not the official artwork.
 */
const dots = (r: number, n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((i / n) * 360 + offset) * (Math.PI / 180);
    return [12 + r * Math.cos(a), 12 + r * Math.sin(a)] as const;
  });

/** Brand colours, so a chain is recognised at a glance. Stock stays the text colour. */
const COLORS: Record<Market, string | undefined> = {
  ethereum: "#8AA1FF",
  solana: "#9945FF",
  bsc: "#F0B90B",
  base: "#2F6BFF",
  arbitrum: "#28A0F0",
  cardano: "#4C7DFF",
  equity: undefined,
};

export function ChainLogo({ chain, className = "size-4 shrink-0", mono = false }: { chain: Market; className?: string; mono?: boolean }) {
  const common = { viewBox: "0 0 24 24", className: `chain-logo ${className}`, style: !mono && COLORS[chain] ? { color: COLORS[chain] } : undefined, "aria-hidden": true, focusable: false } as const;
  switch (chain) {
    case "ethereum":
      return (
        <svg {...common} fill="currentColor">
          <polygon points="12,2 5.2,12.3 12,16.2 18.8,12.3" />
          <polygon points="12,17.4 5.2,13.5 12,22 18.8,13.5" />
        </svg>
      );
    case "solana":
      return (
        <svg {...common} fill="currentColor">
          <polygon points="7,4.5 20.5,4.5 17.5,7.9 4,7.9" fill={mono ? undefined : "#14F195"} />
          <polygon points="4,10.3 17.5,10.3 20.5,13.7 7,13.7" fill={mono ? undefined : "#5DB4D8"} />
          <polygon points="7,16.1 20.5,16.1 17.5,19.5 4,19.5" fill={mono ? undefined : "#9945FF"} />
        </svg>
      );
    case "bsc":
      return (
        <svg {...common} fill="currentColor">
          <polygon points="12,9.2 14.8,12 12,14.8 9.2,12" />
          <polygon points="12,2.5 15.6,6.1 14,7.7 12,5.7 10,7.7 8.4,6.1" />
          <polygon points="12,21.5 15.6,17.9 14,16.3 12,18.3 10,16.3 8.4,17.9" />
          <polygon points="2.5,12 6.1,8.4 7.7,10 5.7,12 7.7,14 6.1,15.6" />
          <polygon points="21.5,12 17.9,8.4 16.3,10 18.3,12 16.3,14 17.9,15.6" />
        </svg>
      );
    case "base":
      return (
        <svg {...common} fill="currentColor">
          <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM11 10.6h11v2.8H11Z" />
        </svg>
      );
    case "arbitrum":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
          <polygon points="12,2.5 20.5,7.25 20.5,16.75 12,21.5 3.5,16.75 3.5,7.25" />
          <path d="M8.8 16.5 12 8l3.2 8.5M9.9 14h4.2" />
        </svg>
      );
    case "cardano":
      return (
        <svg {...common} fill="currentColor">
          <circle cx="12" cy="12" r="1.5" />
          {dots(4.6, 6).map(([x, y], i) => (
            <circle key={`a${i}`} cx={x} cy={y} r="1" />
          ))}
          {dots(8.6, 6, 30).map(([x, y], i) => (
            <circle key={`b${i}`} cx={x} cy={y} r="1.1" />
          ))}
        </svg>
      );
    case "equity":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
          <path d="M3.5 3.5v17h17M7 15l4-4.5 3 3L20 7" />
        </svg>
      );
  }
}

const COINS: Record<string, { color: string; glyph: string }> = {
  "BTC-USD": { color: "#F7931A", glyph: "₿" },
  "XRP-USD": { color: "#8E9AA8", glyph: "X" },
  "DOGE-USD": { color: "#C2A633", glyph: "Ð" },
  "LTC-USD": { color: "#A6A9AA", glyph: "Ł" },
  "LINK-USD": { color: "#2A5ADA", glyph: "⬡" },
  "AVAX-USD": { color: "#E84142", glyph: "A" },
};
const COIN_CHAIN: Record<string, Market> = { "ETH-USD": "ethereum", "SOL-USD": "solana", "BNB-USD": "bsc", "ADA-USD": "cardano" };

/** A major coin's mark, by its Yahoo ticker: the chain's own mark where there is one, otherwise a coloured disc with its glyph. */
export function CoinLogo({ symbol, className = "size-4 shrink-0" }: { symbol: string; className?: string }) {
  const chain = COIN_CHAIN[symbol];
  if (chain) return <ChainLogo chain={chain} className={className} />;
  const c = COINS[symbol] ?? { color: "#8E9AA8", glyph: symbol[0] ?? "?" };
  return (
    <svg viewBox="0 0 24 24" className={`chain-logo ${className}`} aria-hidden focusable={false}>
      <circle cx="12" cy="12" r="11" fill={c.color} />
      <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="700" fill="#fff">
        {c.glyph}
      </text>
    </svg>
  );
}
