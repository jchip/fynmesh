import { LOCALES, type LocaleTuple } from "./generated/locales.js";

const DEFAULT_LOCALE = LOCALES[0];

function getLocale(locale?: string): LocaleTuple {
  if (!locale) return DEFAULT_LOCALE;
  return LOCALES.find((l) => l[0] === locale) ?? DEFAULT_LOCALE;
}

function groupInt(intText: string, groupSep: string): string {
  return intText.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep);
}

/** Formats a number using the target locale's decimal and group separators. */
export function formatNumber(n: number, locale?: string): string {
  const l = getLocale(locale);
  const decimalSep = l[5];
  const groupSep = l[6];
  const negative = n < 0;
  const rounded = Math.round(Math.abs(n) * 100) / 100;
  const [intPart, fracPart] = rounded.toFixed(2).split(".");
  const grouped = groupInt(intPart, groupSep);
  const text = fracPart === "00" ? grouped : `${grouped}${decimalSep}${fracPart}`;
  return negative ? `-${text}` : text;
}

/** Formats a number in compact form, e.g. 1.2K, 3.4M, 5.6B. */
export function formatCompact(n: number, locale?: string): string {
  const l = getLocale(locale);
  const decimalSep = l[5];
  const abs = Math.abs(n);
  const units: Array<[number, string]> = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];
  for (const [unitValue, suffix] of units) {
    if (abs >= unitValue) {
      let text = (n / unitValue).toFixed(1);
      if (text.endsWith(".0")) text = text.slice(0, -2);
      return `${text.replace(".", decimalSep)}${suffix}`;
    }
  }
  return formatNumber(n, locale);
}

/** Formats an integer amount of cents as locale-formatted currency. */
export function formatCurrency(cents: number, locale?: string): string {
  const l = getLocale(locale);
  const decimalSep = l[5];
  const groupSep = l[6];
  const symbol = l[8];
  const position = l[9];
  const negative = cents < 0;
  const value = Math.abs(cents) / 100;
  const [intPart, fracPart] = value.toFixed(2).split(".");
  const grouped = groupInt(intPart, groupSep);
  const text = `${grouped}${decimalSep}${fracPart}`;
  const withSymbol = position === "prefix" ? `${symbol}${text}` : `${text}${symbol}`;
  return negative ? `-${withSymbol}` : withSymbol;
}

/** Formats a 0..1 ratio as a percentage string, e.g. 0.0423 -> "4.2%". */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

const MS_PER_DAY = 86_400_000;
// day 0 of the generated dataset maps to this calendar date.
const EPOCH_UTC = Date.UTC(2025, 0, 1);

/** Formats a dataset day index as a locale-flavored date string. */
export function formatDate(dayIndex: number, locale?: string, style: "short" | "long" = "short"): string {
  const l = getLocale(locale);
  const monthsLong = l[1];
  const pattern = l[10];
  const date = new Date(EPOCH_UTC + dayIndex * MS_PER_DAY);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (style === "short") {
    return pattern
      .replace("YYYY", String(year))
      .replace("MM", String(month + 1).padStart(2, "0"))
      .replace("DD", String(day).padStart(2, "0"));
  }

  const weekdaysLong = l[3];
  const weekdayName = weekdaysLong[date.getUTCDay()];
  const monthName = monthsLong[month];
  return pattern.startsWith("MM")
    ? `${weekdayName}, ${monthName} ${day}, ${year}`
    : `${weekdayName}, ${day} ${monthName} ${year}`;
}
