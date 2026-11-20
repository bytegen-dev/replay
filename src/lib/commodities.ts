/**
 * Commodities that trade on futures exchanges, priced from Yahoo Finance's continuous front-month futures series ("GC=F" is gold).
 * They go through the same pipeline as stocks: pick a symbol, pick a start month, and the monthly buys are worked out from the daily
 * closes. Two things set them apart from stocks, and both are handled where the prices are read (stocks.ts):
 *  - Yahoo quotes many of them in US cents (corn, wheat, soybeans, coffee, sugar, cotton, cattle, hogs, orange juice), which are
 *    turned into dollars.
 *  - A futures series is the contract nearest to expiry, not a spot price, and it can step when one contract is swapped for the next.
 *    Results say so.
 * Diamonds have no exchange price to read, so they are not here.
 */
export interface Commodity {
  /** Yahoo's symbol, e.g. "GC=F". */
  symbol: string;
  name: string;
  group: "Metals" | "Energy" | "Grains" | "Softs" | "Livestock" | "Other";
  /** What one unit of the price is for, e.g. "per troy ounce". */
  unit: string;
  /** Extra words that should find it when searching ("oil" finds crude oil). */
  also?: string[];
}

export const COMMODITIES: Commodity[] = [
  { symbol: "GC=F", name: "Gold", group: "Metals", unit: "per troy ounce", also: ["xau", "bullion"] },
  { symbol: "SI=F", name: "Silver", group: "Metals", unit: "per troy ounce", also: ["xag"] },
  { symbol: "PL=F", name: "Platinum", group: "Metals", unit: "per troy ounce" },
  { symbol: "PA=F", name: "Palladium", group: "Metals", unit: "per troy ounce" },
  { symbol: "HG=F", name: "Copper", group: "Metals", unit: "per pound" },
  { symbol: "ALI=F", name: "Aluminum", group: "Metals", unit: "per metric ton", also: ["aluminium"] },
  { symbol: "CL=F", name: "Crude oil (WTI)", group: "Energy", unit: "per barrel", also: ["oil", "wti", "petroleum"] },
  { symbol: "BZ=F", name: "Brent crude oil", group: "Energy", unit: "per barrel", also: ["oil", "petroleum"] },
  { symbol: "NG=F", name: "Natural gas", group: "Energy", unit: "per MMBtu", also: ["gas"] },
  { symbol: "RB=F", name: "Gasoline (RBOB)", group: "Energy", unit: "per gallon", also: ["petrol", "fuel"] },
  { symbol: "HO=F", name: "Heating oil", group: "Energy", unit: "per gallon", also: ["diesel", "fuel"] },
  { symbol: "ZC=F", name: "Corn", group: "Grains", unit: "per bushel", also: ["maize"] },
  { symbol: "ZW=F", name: "Wheat (Chicago)", group: "Grains", unit: "per bushel" },
  { symbol: "KE=F", name: "Wheat (Kansas City)", group: "Grains", unit: "per bushel", also: ["wheat"] },
  { symbol: "ZS=F", name: "Soybeans", group: "Grains", unit: "per bushel", also: ["soy"] },
  { symbol: "ZM=F", name: "Soybean meal", group: "Grains", unit: "per short ton", also: ["soy"] },
  { symbol: "ZL=F", name: "Soybean oil", group: "Grains", unit: "per pound", also: ["soy"] },
  { symbol: "ZO=F", name: "Oats", group: "Grains", unit: "per bushel" },
  { symbol: "ZR=F", name: "Rough rice", group: "Grains", unit: "per hundredweight", also: ["rice"] },
  { symbol: "KC=F", name: "Coffee", group: "Softs", unit: "per pound" },
  { symbol: "CC=F", name: "Cocoa", group: "Softs", unit: "per metric ton", also: ["chocolate"] },
  { symbol: "SB=F", name: "Sugar", group: "Softs", unit: "per pound" },
  { symbol: "CT=F", name: "Cotton", group: "Softs", unit: "per pound" },
  { symbol: "OJ=F", name: "Orange juice", group: "Softs", unit: "per pound" },
  { symbol: "LE=F", name: "Live cattle", group: "Livestock", unit: "per pound", also: ["beef"] },
  { symbol: "GF=F", name: "Feeder cattle", group: "Livestock", unit: "per pound", also: ["beef"] },
  { symbol: "HE=F", name: "Lean hogs", group: "Livestock", unit: "per pound", also: ["pork", "pigs"] },
  { symbol: "LBR=F", name: "Lumber", group: "Other", unit: "per 1,000 board feet", also: ["wood", "timber"] },
  { symbol: "DC=F", name: "Milk (Class III)", group: "Other", unit: "per hundredweight", also: ["dairy"] },
];

const BY_SYMBOL = new Map(COMMODITIES.map((c) => [c.symbol, c]));

/** The commodity for a symbol such as "GC=F" (any case), or undefined for anything else. */
export const commodityFor = (symbol: string): Commodity | undefined => BY_SYMBOL.get(symbol.trim().toUpperCase());

/** True for a futures symbol as Yahoo writes it ("GC=F"). */
export const isFuturesSymbol = (symbol: string): boolean => /^[A-Z0-9]{1,4}=F$/i.test(symbol.trim());
