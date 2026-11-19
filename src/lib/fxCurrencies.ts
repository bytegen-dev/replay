/**
 * The currencies the app can convert, and where each one's history comes from. Rates are "units of that currency per 1 US
 * dollar". Sources, in the order they are tried:
 *   fred  US Federal Reserve H.10 daily rates (public CSV, no key). Some go back to 1971.
 *   ecb   European Central Bank reference rates through Frankfurter. About 30 currencies, daily, from 1999.
 *   imf   IMF International Financial Statistics through DBnomics: monthly end-of-period official rates, back to the 1950s
 *         for nearly every country (Nigeria from 1957). Used alone for currencies the other two lack, and to reach back
 *         before 1999 for the ECB ones.
 * Recent months are topped up from a daily feed (see fxSources.ts). These are official or interbank rates, not black-market ones.
 */

export interface FxCurrency {
  code: string;
  name: string;
  symbol: string;
  /** FRED series id, and whether it quotes the currency per dollar or dollars per currency. */
  fred?: { id: string; quote: "ccy-per-usd" | "usd-per-ccy" };
  ecb?: true;
  /** ISO 3166 alpha-2 country code for the IMF series. */
  imf?: string;
}

const C = (code: string, name: string, symbol: string, rest: Partial<FxCurrency> = {}): FxCurrency => ({ code, name, symbol, ...rest });
const F = (id: string, quote: "ccy-per-usd" | "usd-per-ccy" = "ccy-per-usd") => ({ fred: { id, quote } });

export const USD: FxCurrency = C("USD", "US Dollar", "$");

export const CURRENCIES: FxCurrency[] = [
  USD,
  C("EUR", "Euro", "€", F("DEXUSEU", "usd-per-ccy")),
  C("GBP", "British Pound", "£", F("DEXUSUK", "usd-per-ccy")),
  C("JPY", "Japanese Yen", "¥", F("DEXJPUS")),
  C("CAD", "Canadian Dollar", "C$", F("DEXCAUS")),
  C("AUD", "Australian Dollar", "A$", F("DEXUSAL", "usd-per-ccy")),
  C("NZD", "New Zealand Dollar", "NZ$", F("DEXUSNZ", "usd-per-ccy")),
  C("CHF", "Swiss Franc", "CHF", F("DEXSZUS")),
  C("CNY", "Chinese Yuan", "CN¥", F("DEXCHUS")),
  C("INR", "Indian Rupee", "₹", F("DEXINUS")),
  C("KRW", "South Korean Won", "₩", F("DEXKOUS")),
  C("HKD", "Hong Kong Dollar", "HK$", F("DEXHKUS")),
  C("SGD", "Singapore Dollar", "S$", F("DEXSIUS")),
  C("TWD", "Taiwan Dollar", "NT$", F("DEXTAUS")),
  C("THB", "Thai Baht", "฿", F("DEXTHUS")),
  C("MYR", "Malaysian Ringgit", "RM", F("DEXMAUS")),
  C("LKR", "Sri Lankan Rupee", "Rs", F("DEXSLUS")),
  C("SEK", "Swedish Krona", "kr", F("DEXSDUS")),
  C("NOK", "Norwegian Krone", "kr", F("DEXNOUS")),
  C("DKK", "Danish Krone", "kr", F("DEXDNUS")),
  C("ZAR", "South African Rand", "R", F("DEXSFUS")),
  C("MXN", "Mexican Peso", "MX$", F("DEXMXUS")),
  C("BRL", "Brazilian Real", "R$", F("DEXBZUS")),
  C("TRY", "Turkish Lira", "₺", { ecb: true, imf: "TR" }),
  C("PLN", "Polish Zloty", "zł", { ecb: true, imf: "PL" }),
  C("CZK", "Czech Koruna", "Kč", { ecb: true, imf: "CZ" }),
  C("HUF", "Hungarian Forint", "Ft", { ecb: true, imf: "HU" }),
  C("ILS", "Israeli Shekel", "₪", { ecb: true, imf: "IL" }),
  C("IDR", "Indonesian Rupiah", "Rp", { ecb: true, imf: "ID" }),
  C("PHP", "Philippine Peso", "₱", { ecb: true, imf: "PH" }),
  C("NGN", "Nigerian Naira", "₦", { imf: "NG" }),
  C("GHS", "Ghanaian Cedi", "GH₵", { imf: "GH" }),
  C("KES", "Kenyan Shilling", "KSh", { imf: "KE" }),
  C("EGP", "Egyptian Pound", "E£", { imf: "EG" }),
  C("MAD", "Moroccan Dirham", "MAD", { imf: "MA" }),
  C("TZS", "Tanzanian Shilling", "TSh", { imf: "TZ" }),
  C("UGX", "Ugandan Shilling", "USh", { imf: "UG" }),
  C("ZMW", "Zambian Kwacha", "ZK", { imf: "ZM" }),
  C("ETB", "Ethiopian Birr", "Br", { imf: "ET" }),
  C("PKR", "Pakistani Rupee", "₨", { imf: "PK" }),
  C("BDT", "Bangladeshi Taka", "৳", { imf: "BD" }),
  C("VND", "Vietnamese Dong", "₫", { imf: "VN" }),
  C("ARS", "Argentine Peso", "AR$", { imf: "AR" }),
  C("CLP", "Chilean Peso", "CL$", { imf: "CL" }),
  C("COP", "Colombian Peso", "CO$", { imf: "CO" }),
  C("PEN", "Peruvian Sol", "S/", { imf: "PE" }),
  C("RUB", "Russian Ruble", "₽", { imf: "RU" }),
  C("UAH", "Ukrainian Hryvnia", "₴", { imf: "UA" }),
  C("AED", "UAE Dirham", "AED", { imf: "AE" }),
  C("SAR", "Saudi Riyal", "SAR", { imf: "SA" }),
  C("QAR", "Qatari Riyal", "QAR", { imf: "QA" }),
];

/** Each currency's country (the euro is the EU), for the flag shown beside it. */
const COUNTRY: Record<string, string> = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", CAD: "CA", AUD: "AU", NZD: "NZ", CHF: "CH", CNY: "CN", INR: "IN", KRW: "KR", HKD: "HK",
  SGD: "SG", TWD: "TW", THB: "TH", MYR: "MY", LKR: "LK", SEK: "SE", NOK: "NO", DKK: "DK", ZAR: "ZA", MXN: "MX", BRL: "BR", TRY: "TR",
  PLN: "PL", CZK: "CZ", HUF: "HU", ILS: "IL", IDR: "ID", PHP: "PH", NGN: "NG", GHS: "GH", KES: "KE", EGP: "EG", MAD: "MA", TZS: "TZ",
  UGX: "UG", ZMW: "ZM", ETB: "ET", PKR: "PK", BDT: "BD", VND: "VN", ARS: "AR", CLP: "CL", COP: "CO", PEN: "PE", RUB: "RU", UAH: "UA",
  AED: "AE", SAR: "SA", QAR: "QA",
};

/** The flag emoji for a currency: two regional-indicator letters built from its country code. Empty if unknown. */
export function flagFor(code: string): string {
  const cc = COUNTRY[code.trim().toUpperCase()];
  return cc ? String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : "";
}

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export const currencyByCode = (code: string | undefined | null): FxCurrency | undefined => (code ? BY_CODE.get(code.trim().toUpperCase()) : undefined);
export const isCurrency = (code: unknown): code is string => typeof code === "string" && BY_CODE.has(code.trim().toUpperCase());

/** Matches on code, name, symbol or the first letters of any word, so "naira", "ngn", "₦" and "south" all find something. */
export function filterCurrencies(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return CURRENCIES;
  const score = (c: (typeof CURRENCIES)[number]) => {
    const code = c.code.toLowerCase();
    const name = c.name.toLowerCase();
    if (code === q) return 0;
    if (code.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.split(" ").some((w) => w.startsWith(q))) return 3;
    if (name.includes(q) || c.symbol.toLowerCase() === q) return 4;
    return 9;
  };
  return CURRENCIES.map((c) => [c, score(c)] as const)
    .filter(([, s]) => s < 9)
    .sort((a, b) => a[1] - b[1])
    .map(([c]) => c);
}

