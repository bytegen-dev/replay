export const NA = "n/a";

export function fmtUsd(x: number | null, maxDigits = 2): string {
  if (x === null || !Number.isFinite(x)) return NA;
  return x.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: maxDigits });
}

/** Token prices are often tiny; keep ~4 significant digits below $1. */
export function fmtPrice(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return NA;
  if (x >= 1) return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return x.toPrecision(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function fmtNum(x: number | null, decimals = 0): string {
  if (x === null || !Number.isFinite(x)) return NA;
  return x.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return NA;
  return `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;
}

export function fmtSigned(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return NA;
  return `${x >= 0 ? "+" : "-"}${fmtUsd(Math.abs(x))}`;
}
