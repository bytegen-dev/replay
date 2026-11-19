import type { Market } from "./types.ts";

/**
 * Reads "when" for a historical price lookup from plain text, the way a person (or a chat bot passing a person's
 * words along) would write it:
 *
 *   dates   15/09/2026 · 15-09-2026 · 2026-09-15 · September 15 2026 · 15 Sep 2026 · September 15 (no year)
 *           today · yesterday · now · 5 days ago · 3 weeks ago · 5 months ago · 1 year ago · 2 hours ago · 30 min ago
 *   times   13:40 · 1:40pm · 1pm · 13h40            (optional; without one you get that day's closing price)
 *   zones   UTC (default) · UTC+2 · GMT-5 · +05:30 · EST · Europe/London
 *
 * Everything is worked out in the timezone given (UTC if none), then turned into one UTC moment.
 * Anything it had to assume is listed in `assumptions`, so the answer can say so.
 */

export type Precision = "minute" | "day";

export interface When {
  /**
   * The moment the price is wanted at (ms, UTC). For a whole day this is the END of that day, so the price is the
   * day's close. Never later than "now".
   */
  instantMs: number;
  precision: Precision;
  /** UTC calendar day of the moment (for a whole day, the day asked about). */
  dateUtc: string;
  /** HH:MM in UTC, for minute precision. */
  timeUtc: string | null;
  /** "UTC" or the zone as given, e.g. "UTC+02:00". */
  timezone: string;
  /** True when the moment is the present: "now", or a day that has not finished yet. */
  isNow: boolean;
  /** The moment in plain words, always in UTC. */
  description: string;
  /** What was guessed or adjusted, in plain words. */
  assumptions: string[];
}

export type WhenResult = { ok: true; value: When } | { ok: false; error: string; field: "date" | "time" | "tz" };

export interface WhenInput {
  date?: string | null;
  time?: string | null;
  tz?: string | null;
}

/* ------------------------------ chain prefixes ------------------------------ */

const PREFIXES: Record<string, Market> = {
  sol: "solana",
  solana: "solana",
  eth: "ethereum",
  ethereum: "ethereum",
  base: "base",
  bsc: "bsc",
  bnb: "bsc",
  binance: "bsc",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  ada: "cardano",
  cardano: "cardano",
  stock: "equity",
  stocks: "equity",
  equity: "equity",
  us: "equity",
  etf: "equity",
};

/** The short prefix a chat command uses for each market. */
export const PREFIX_FOR: Record<Market, string> = { solana: "SOL", ethereum: "ETH", base: "BASE", bsc: "BSC", arbitrum: "ARB", cardano: "ADA", equity: "STOCK" };

export const PREFIX_HELP = "SOL, ETH, BASE, BSC, ARB, ADA or STOCK";

/** "SOL" -> solana, "bnb" -> bsc, "STOCK" -> equity. Null when it is not a known prefix. */
export function parseMarketPrefix(text: string | null | undefined): Market | null {
  return PREFIXES[(text ?? "").trim().toLowerCase().replace(/[^a-z]/g, "")] ?? null;
}

/** The chain an address can only belong to, when its shape says so. EVM addresses are shared by several chains, so null. */
export function inferChain(address: string): Market | null {
  const a = address.trim();
  if (/^[0-9a-fA-F]{56}(?:[0-9a-fA-F]{2}){0,32}$/.test(a)) return "cardano";
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return null;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return "solana";
  return null;
}

/* ------------------------------ calendar helpers ------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

interface Ymd {
  y: number;
  m: number;
  d: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymdMs = (v: Ymd) => Date.UTC(v.y, v.m - 1, v.d);
const fromMs = (ms: number): Ymd => {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
const isRealDate = (v: Ymd) => v.m >= 1 && v.m <= 12 && v.d >= 1 && fromMs(ymdMs(v)).d === v.d && fromMs(ymdMs(v)).m === v.m;
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const showDay = (v: Ymd) => `${v.d} ${MONTH_NAMES[v.m - 1]} ${v.y}`;

/** Calendar subtraction: 31 March minus 1 month is 28 (or 29) February, never 3 March. */
function minusMonths(v: Ymd, n: number): Ymd {
  const total = v.y * 12 + (v.m - 1) - n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(v.d, lastDayOf(y, m)) };
}

/* ------------------------------ timezones ------------------------------ */

interface Zone {
  label: string;
  /** Minutes east of UTC at the given UTC moment (this is what makes daylight saving work). */
  offsetAt: (utcMs: number) => number;
}

const FIXED_ABBREVIATIONS: Record<string, number> = {
  utc: 0, gmt: 0, z: 0, wat: 60, cet: 60, cest: 120, eet: 120, eest: 180, msk: 180, bst: 60, ist: 330, pkt: 300,
  sgt: 480, hkt: 480, jst: 540, kst: 540, aest: 600, aedt: 660, nzst: 720, nzdt: 780,
  est: -300, edt: -240, cst: -360, cdt: -300, mst: -420, mdt: -360, pst: -480, pdt: -420,
};

const fixedZone = (minutes: number, label: string): Zone => ({ label, offsetAt: () => minutes });

function ianaOffsetMinutes(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** UTC, UTC+2, GMT-5, +05:30, -0800, EST, Europe/London, America/New_York. Null if unreadable. */
export function parseZone(text: string | null | undefined): Zone | null {
  const raw = (text ?? "").trim();
  if (!raw) return fixedZone(0, "UTC");
  const abbr = FIXED_ABBREVIATIONS[raw.toLowerCase()];
  if (abbr !== undefined) return fixedZone(abbr, abbr === 0 ? "UTC" : raw.toUpperCase());

  const off = /^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?([0-5]\d))?$/i.exec(raw);
  if (off) {
    const hours = Number(off[2]);
    const mins = off[3] ? Number(off[3]) : 0;
    if (hours > 14 || (hours === 14 && mins > 0)) return null;
    const total = (off[1] === "-" ? -1 : 1) * (hours * 60 + mins);
    return fixedZone(total, `UTC${off[1]}${pad(hours)}:${pad(mins)}`);
  }
  if (/^[A-Za-z]+(?:[/_-][A-Za-z_+-]+)+$/.test(raw) || /^[A-Za-z]+\/[A-Za-z_]+$/.test(raw)) {
    try {
      ianaOffsetMinutes(raw, Date.UTC(2026, 0, 1));
      return { label: raw, offsetAt: (ms) => ianaOffsetMinutes(raw, ms) };
    } catch {
      return null;
    }
  }
  return null;
}

/** The UTC moment for a wall-clock time in a zone, correct across daylight-saving changes. */
function wallToUtc(v: Ymd, hour: number, minute: number, zone: Zone): number {
  const naive = Date.UTC(v.y, v.m - 1, v.d, hour, minute);
  const first = naive - zone.offsetAt(naive) * 60_000;
  return naive - zone.offsetAt(first) * 60_000;
}

const localYmd = (utcMs: number, zone: Zone): Ymd => fromMs(utcMs + zone.offsetAt(utcMs) * 60_000);

/* ------------------------------ times ------------------------------ */

const TIME_PATTERN = "(?:([01]?\\d|2[0-3])[:h]([0-5]\\d)(?::[0-5]\\d)?\\s*(am|pm)?|(1[0-2]|0?[1-9])\\s*(am|pm))";
const TIME_ONLY = new RegExp(`^${TIME_PATTERN}$`, "i");
const TIME_IN_TEXT = new RegExp(`(?<![\\d/.:-])${TIME_PATTERN}(?![\\d/:.-])`, "i");

interface Hm {
  hour: number;
  minute: number;
}

function hmFromMatch(m: RegExpExecArray): Hm | string {
  let hour = Number(m[1] ?? m[4]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = (m[3] ?? m[5])?.toLowerCase();
  if (ampm) {
    if (hour < 1 || hour > 12) return `"${m[0].trim()}" mixes a 24-hour time with am/pm`;
    hour = (hour % 12) + (ampm === "pm" ? 12 : 0);
  }
  return { hour, minute };
}

/** "13:40", "1:40pm", "1pm", "13h40" -> hour and minute. */
export function parseTime(text: string): Hm | string {
  const m = TIME_ONLY.exec(text.trim());
  if (!m) return `Couldn't read the time "${text.trim()}". Use 13:40 or 1:40pm.`;
  return hmFromMatch(m);
}

/** Pulls the first clock time out of free text, returning it and the text without it. */
export function extractTime(text: string): { time: string | null; rest: string } {
  const m = TIME_IN_TEXT.exec(text);
  if (!m) return { time: null, rest: text.trim() };
  return { time: m[0].trim(), rest: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim() };
}

/* ------------------------------ dates ------------------------------ */

type DatePhrase =
  | { kind: "now" }
  | { kind: "instant"; ms: number; assumptions: string[] }
  | { kind: "date"; ymd: Ymd; assumptions: string[] }
  | { kind: "error"; error: string };

const UNITS: Record<string, "minute" | "hour" | "day" | "week" | "month" | "year"> = {
  m: "minute", min: "minute", mins: "minute", minute: "minute", minutes: "minute",
  h: "hour", hr: "hour", hrs: "hour", hour: "hour", hours: "hour",
  d: "day", day: "day", days: "day",
  w: "week", wk: "week", wks: "week", week: "week", weeks: "week",
  mo: "month", mos: "month", month: "month", months: "month",
  y: "year", yr: "year", yrs: "year", year: "year", years: "year",
};

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const HELP = "Try 15/09/2026, September 15 2026, 5 days ago or 5 months ago.";

function parseDatePhrase(input: string, nowMs: number, zone: Zone): DatePhrase {
  const text = input.toLowerCase().replace(/[,]/g, " ").replace(/\b(on|at|the|of)\b/g, " ").replace(/\s+/g, " ").trim();
  const today = localYmd(nowMs, zone);

  if (text === "" || text === "now") return { kind: "now" };
  if (text === "today") return { kind: "date", ymd: today, assumptions: [] };
  if (text === "yesterday") return { kind: "date", ymd: fromMs(ymdMs(today) - DAY_MS), assumptions: [] };
  if (text === "tomorrow") return { kind: "error", error: "Tomorrow hasn't happened yet, so there's no price to look up." };

  // A unix timestamp: 10 digits is seconds, 13 is milliseconds.
  const unix = /^@?(\d{10}|\d{13})$/.exec(text);
  if (unix) return { kind: "instant", ms: unix[1].length === 10 ? Number(unix[1]) * 1000 : Number(unix[1]), assumptions: [] };

  // "5 days ago", "a week ago", "30 min ago", "last month"
  const rel = /^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*([a-z]+)\s+ago$/.exec(text) ?? /^()last\s+(week|month|year)$/.exec(text);
  if (rel) {
    const n = rel[1] === "" ? 1 : /^\d+$/.test(rel[1]) ? Number(rel[1]) : WORD_NUMBERS[rel[1]];
    const unit = UNITS[rel[2]];
    if (!unit || !Number.isFinite(n) || n < 0) return { kind: "error", error: `Couldn't read "${input.trim()}". ${HELP}` };
    if (unit === "minute") return { kind: "instant", ms: nowMs - n * 60_000, assumptions: [] };
    if (unit === "hour") return { kind: "instant", ms: nowMs - n * 3_600_000, assumptions: [] };
    if (n > 5000) return { kind: "error", error: `"${input.trim()}" is too far back to be a real date.` };
    if (unit === "day") return { kind: "date", ymd: fromMs(ymdMs(today) - n * DAY_MS), assumptions: [] };
    if (unit === "week") return { kind: "date", ymd: fromMs(ymdMs(today) - n * 7 * DAY_MS), assumptions: [] };
    if (unit === "month") return { kind: "date", ymd: minusMonths(today, n), assumptions: [] };
    return { kind: "date", ymd: minusMonths(today, n * 12), assumptions: [] };
  }

  // 15/09/2026, 15-09-2026, 15.09.2026, 15/09/26 (day first, as written in most of the world)
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(text);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const ymd = { y: year, m: Number(dmy[2]), d: Number(dmy[1]) };
    if (!isRealDate(ymd)) return { kind: "error", error: `${dmy[0]} isn't a real date. Dates are day first: dd/mm/yyyy.` };
    return { kind: "date", ymd, assumptions: dmy[3].length === 2 ? [`Read the 2-digit year ${dmy[3]} as ${year}.`] : [] };
  }

  // 2026-09-15 and 2026/09/15
  const iso = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(text);
  if (iso) {
    const ymd = { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
    if (!isRealDate(ymd)) return { kind: "error", error: `${iso[0]} isn't a real date.` };
    return { kind: "date", ymd, assumptions: [] };
  }

  // "September 15 2026", "Sept 15th", "15 September 2026", "15 sep"
  const monthFirst = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/.exec(text);
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(text);
  const named = monthFirst ? { month: monthFirst[1], day: monthFirst[2], year: monthFirst[3] } : dayFirst ? { month: dayFirst[2], day: dayFirst[1], year: dayFirst[3] } : null;
  if (named && MONTHS[named.month]) {
    const m = MONTHS[named.month];
    const d = Number(named.day);
    const assumptions: string[] = [];
    let y = named.year ? Number(named.year) : today.y;
    if (!named.year) {
      // No year given: this year, unless that day is still ahead (or doesn't exist this year), in which case the
      // most recent year it has already happened in.
      let found: number | null = null;
      for (let yy = today.y; yy >= today.y - 8; yy--) {
        if (isRealDate({ y: yy, m, d }) && ymdMs({ y: yy, m, d }) <= ymdMs(today)) {
          found = yy;
          break;
        }
      }
      if (found === null) return { kind: "error", error: `${MONTH_NAMES[m - 1]} ${d} isn't a real date.` };
      if (found === today.y) assumptions.push(`No year given, so used ${found}.`);
      else if (isRealDate({ y: today.y, m, d })) assumptions.push(`No year given, and ${d} ${MONTH_NAMES[m - 1]} ${today.y} hasn't happened yet, so used ${found}.`);
      else assumptions.push(`No year given, and ${d} ${MONTH_NAMES[m - 1]} doesn't exist in ${today.y}, so used ${found}.`);
      y = found;
    }
    const ymd = { y, m, d };
    if (!isRealDate(ymd)) return { kind: "error", error: `${MONTH_NAMES[m - 1]} ${d} ${y} isn't a real date.` };
    return { kind: "date", ymd, assumptions };
  }

  return { kind: "error", error: `Couldn't read the date "${input.trim()}". ${HELP}` };
}

/* ------------------------------ putting it together ------------------------------ */

const formatUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

const FIRST_YEAR = 2009;

export function parseWhen(input: WhenInput, nowMs: number = Date.now()): WhenResult {
  const fail = (error: string, field: "date" | "time" | "tz"): WhenResult => ({ ok: false, error, field });

  const zone = parseZone(input.tz);
  if (!zone) return fail(`Couldn't read the timezone "${(input.tz ?? "").trim()}". Use UTC, UTC+2, EST or a name like Europe/London.`, "tz");

  // A time can ride along in the date text ("15 Sep 13:40"); an explicit `time` wins.
  let dateText = (input.date ?? "").trim();
  let timeText = (input.time ?? "").trim();
  if (!timeText) {
    const found = extractTime(dateText);
    timeText = found.time ?? "";
    dateText = found.rest;
  }

  let hm: Hm | null = null;
  if (timeText) {
    const t = parseTime(timeText);
    if (typeof t === "string") return fail(t, "time");
    hm = t;
  }

  const phrase = parseDatePhrase(dateText, nowMs, zone);
  if (phrase.kind === "error") return fail(phrase.error, "date");

  const assumptions: string[] = phrase.kind === "now" ? [] : phrase.kind === "date" || phrase.kind === "instant" ? [...phrase.assumptions] : [];
  const isUtc = zone.label === "UTC";
  let instantMs: number;
  let precision: Precision;
  let dayLabel: string | null = null;
  let partialDay = false;

  if (phrase.kind === "instant") {
    if (hm) return fail(`"${dateText}" already says the time, so a separate time (${timeText}) would contradict it. Drop one.`, "time");
    instantMs = Math.floor(phrase.ms / 60_000) * 60_000;
    precision = "minute";
  } else if (phrase.kind === "now" && !hm) {
    instantMs = Math.floor(nowMs / 60_000) * 60_000;
    precision = "minute";
  } else {
    const ymd = phrase.kind === "date" ? phrase.ymd : localYmd(nowMs, zone);
    if (phrase.kind === "now" && hm) assumptions.push("No date given, so used today.");
    if (ymd.y < FIRST_YEAR) return fail(`${ymd.y} is before there are any prices to look up.`, "date");
    if (hm) {
      instantMs = wallToUtc(ymd, hm.hour, hm.minute, zone);
      precision = "minute";
    } else {
      // A day that hasn't started yet has no price. One that has started but not finished is "today".
      if (wallToUtc(ymd, 0, 0, zone) > nowMs) {
        return fail(`${showDay(ymd)} is in the future (today is ${showDay(localYmd(nowMs, zone))}), so there's no price yet.`, "date");
      }
      // A whole day: its close is the price at the moment the next day begins.
      const next = fromMs(ymdMs(ymd) + DAY_MS);
      instantMs = wallToUtc(next, 0, 0, zone);
      precision = "day";
      dayLabel = showDay(ymd);
      if (instantMs > nowMs) {
        partialDay = true;
        instantMs = Math.floor(nowMs / 60_000) * 60_000;
        assumptions.push(`${dayLabel} isn't over yet, so this is the latest price.`);
      }
    }
  }

  if (instantMs > nowMs + 60_000) {
    return fail(`${formatUtc(instantMs)} is in the future (it is ${formatUtc(nowMs)} now), so there's no price yet.`, hm || phrase.kind !== "date" ? "time" : "date");
  }
  instantMs = Math.min(instantMs, Math.floor(nowMs / 60_000) * 60_000 + 59_999);

  const utc = new Date(instantMs);
  const dayUtc = precision === "day" && !partialDay ? new Date(instantMs - 1) : utc;
  const isNow = partialDay || nowMs - instantMs < 90_000;
  const timeUtc = precision === "minute" ? `${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}` : null;

  if (precision === "minute" && !isUtc && hm) assumptions.push(`Times were read as ${zone.label}, which is ${timeUtc} UTC.`);
  if (precision === "day" && !isUtc && !partialDay) assumptions.push(`The day ends at midnight ${zone.label}, which is ${formatUtc(instantMs)}.`);

  return {
    ok: true,
    value: {
      instantMs,
      precision,
      dateUtc: `${dayUtc.getUTCFullYear()}-${pad(dayUtc.getUTCMonth() + 1)}-${pad(dayUtc.getUTCDate())}`,
      timeUtc,
      timezone: zone.label,
      isNow,
      description: precision === "day" && !partialDay ? `${dayLabel}, closing price (end of day ${isUtc ? "UTC" : zone.label})` : isNow ? "now (latest price)" : formatUtc(instantMs),
      assumptions,
    },
  };
}

/* ------------------------------ one line of text, as a chat bot sends it ------------------------------ */

export interface ParsedQuery {
  address: string;
  market: Market | null;
  date: string;
  time: string;
  tz: string;
  error?: string;
}

const DATE_WORDS = /^(today|yesterday|now|last|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|on|at)$/i;

const ZONE_AT_END = /\b((?:utc|gmt)\s*[+-]\s*\d{1,2}(?::?[0-5]\d)?|utc|gmt|[a-z]+\/[a-z_]+(?:\/[a-z_]+)?|(?:est|edt|cst|cdt|mst|mdt|pst|pdt|cet|cest|eet|eest|msk|bst|ist|pkt|sgt|hkt|jst|kst|aest|aedt|nzst|nzdt|wat))\s*$/i;

/**
 * "So11...112 SOL 13:40 15/09/2026" -> address, market, time, date. This is the order of the chat command
 * `/historical-price {address} {chain} {time?} {date}`. The chain can be left out when the address only fits one
 * (Solana, Cardano); the time can come before or after the date; a timezone can end the line.
 */
export function parseHistoricalQuery(q: string): ParsedQuery {
  const tokens = q.replace(/[<>{}]/g, " ").trim().split(/\s+/).filter(Boolean);
  const blank: ParsedQuery = { address: "", market: null, date: "", time: "", tz: "" };
  if (tokens.length === 0) return { ...blank, error: `Give a contract address, a chain (${PREFIX_HELP}) and a date, e.g. "<address> SOL 15/09/2026".` };

  const address = tokens[0].replace(/^[,;:]+|[,;:]+$/g, "");
  let market = tokens[1] !== undefined ? parseMarketPrefix(tokens[1]) : null;
  let rest = tokens.slice(market ? 2 : 1).join(" ");
  if (!market) {
    // A word in the chain's place that isn't a date word is a mistyped chain, whatever the address looks like.
    const second = tokens[1];
    const looksLikeChain = second !== undefined && /^[a-z]{2,10}$/i.test(second) && !MONTHS[second.toLowerCase()] && !DATE_WORDS.test(second);
    if (looksLikeChain) return { ...blank, address, error: `"${second}" isn't a chain I know. Use ${PREFIX_HELP}.` };
    const inferred = inferChain(address);
    if (inferred) market = inferred;
    else if (/^0x/i.test(address)) return { ...blank, address, error: `That address works on several chains. Say which one: ${PREFIX_HELP}.` };
  }

  let tz = "";
  const z = ZONE_AT_END.exec(rest);
  if (z) {
    tz = z[1];
    rest = rest.slice(0, z.index).trim();
  }
  const { time, rest: date } = extractTime(rest);
  return { address, market, date, time: time ?? "", tz };
}
