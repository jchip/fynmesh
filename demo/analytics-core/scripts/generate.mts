// Generates src/generated/*.ts from a seeded PRNG so output is byte-identical
// across runs. This file is executed directly by Node (type-stripped), so it
// must stick to erasable TypeScript syntax only: no enums, no namespaces, no
// parameter properties.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SEED = 0x2f5a1c3b;

function mulberry32(seed: number) {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, values: T[]): T {
  return values[Math.floor(random() * values.length)];
}

function randInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "src", "generated");
mkdirSync(outDir, { recursive: true });

function writeGenerated(name: string, body: string) {
  const header =
    "// GENERATED FILE. Do not edit by hand — run `npm run build` (scripts/generate.mts).\n\n";
  writeFileSync(join(outDir, name), header + body, "utf8");
}

// ---------------------------------------------------------------------------
// Locales
// ---------------------------------------------------------------------------

type BaseLocale = {
  tag: string;
  monthsLong: string[];
  monthsShort: string[];
  weekdaysLong: string[];
  weekdaysShort: string[];
  decimalSep: string;
  groupSep: string;
  currencyCode: string;
  currencySymbol: string;
  currencyPosition: "prefix" | "suffix";
  datePattern: string;
};

// Ten common locales with real names, used both as-is and as the seed
// material that the remaining locales are derived from.
const BASE_LOCALES: BaseLocale[] = [
  {
    tag: "en-US",
    monthsLong: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    weekdaysLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    decimalSep: ".", groupSep: ",", currencyCode: "USD", currencySymbol: "$",
    currencyPosition: "prefix", datePattern: "MM/DD/YYYY",
  },
  {
    tag: "en-GB",
    monthsLong: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    weekdaysLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    decimalSep: ".", groupSep: ",", currencyCode: "GBP", currencySymbol: "£",
    currencyPosition: "prefix", datePattern: "DD/MM/YYYY",
  },
  {
    tag: "de-DE",
    monthsLong: [
      "Januar", "Februar", "März", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember",
    ],
    monthsShort: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
    weekdaysLong: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
    weekdaysShort: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    decimalSep: ",", groupSep: ".", currencyCode: "EUR", currencySymbol: "€",
    currencyPosition: "suffix", datePattern: "DD.MM.YYYY",
  },
  {
    tag: "fr-FR",
    monthsLong: [
      "janvier", "février", "mars", "avril", "mai", "juin",
      "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    ],
    monthsShort: ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"],
    weekdaysLong: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
    weekdaysShort: ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"],
    decimalSep: ",", groupSep: " ", currencyCode: "EUR", currencySymbol: "€",
    currencyPosition: "suffix", datePattern: "DD/MM/YYYY",
  },
  {
    tag: "es-ES",
    monthsLong: [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ],
    monthsShort: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    weekdaysLong: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    weekdaysShort: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
    decimalSep: ",", groupSep: ".", currencyCode: "EUR", currencySymbol: "€",
    currencyPosition: "suffix", datePattern: "DD/MM/YYYY",
  },
  {
    tag: "it-IT",
    monthsLong: [
      "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
      "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
    ],
    monthsShort: ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
    weekdaysLong: ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"],
    weekdaysShort: ["dom", "lun", "mar", "mer", "gio", "ven", "sab"],
    decimalSep: ",", groupSep: ".", currencyCode: "EUR", currencySymbol: "€",
    currencyPosition: "suffix", datePattern: "DD/MM/YYYY",
  },
  {
    tag: "pt-BR",
    monthsLong: [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ],
    monthsShort: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
    weekdaysLong: ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"],
    weekdaysShort: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
    decimalSep: ",", groupSep: ".", currencyCode: "BRL", currencySymbol: "R$",
    currencyPosition: "prefix", datePattern: "DD/MM/YYYY",
  },
  {
    tag: "nl-NL",
    monthsLong: [
      "januari", "februari", "maart", "april", "mei", "juni",
      "juli", "augustus", "september", "oktober", "november", "december",
    ],
    monthsShort: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
    weekdaysLong: ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"],
    weekdaysShort: ["zo", "ma", "di", "wo", "do", "vr", "za"],
    decimalSep: ",", groupSep: ".", currencyCode: "EUR", currencySymbol: "€",
    currencyPosition: "prefix", datePattern: "DD-MM-YYYY",
  },
  {
    tag: "sv-SE",
    monthsLong: [
      "januari", "februari", "mars", "april", "maj", "juni",
      "juli", "augusti", "september", "oktober", "november", "december",
    ],
    monthsShort: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
    weekdaysLong: ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"],
    weekdaysShort: ["sön", "mån", "tis", "ons", "tor", "fre", "lör"],
    decimalSep: ",", groupSep: " ", currencyCode: "SEK", currencySymbol: "kr",
    currencyPosition: "suffix", datePattern: "YYYY-MM-DD",
  },
  {
    tag: "pl-PL",
    monthsLong: [
      "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
      "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
    ],
    monthsShort: ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"],
    weekdaysLong: ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"],
    weekdaysShort: ["nie", "pon", "wto", "śro", "czw", "pią", "sob"],
    decimalSep: ",", groupSep: " ", currencyCode: "PLN", currencySymbol: "zł",
    currencyPosition: "suffix", datePattern: "DD.MM.YYYY",
  },
];

// Real BCP-47 tags with content derived from a base locale above, plus a
// plausible currency/pattern lookup. Not linguistically accurate, but
// deterministic and distinct per tag.
const DERIVED_TAGS: [tag: string, currencyCode: string, currencySymbol: string, currencyPosition: "prefix" | "suffix", datePattern: string][] = [
  ["ja-JP", "JPY", "¥", "prefix", "YYYY/MM/DD"],
  ["zh-CN", "CNY", "¥", "prefix", "YYYY-MM-DD"],
  ["ru-RU", "RUB", "₽", "suffix", "DD.MM.YYYY"],
  ["ar-SA", "SAR", "ر.س", "suffix", "DD/MM/YYYY"],
  ["hi-IN", "INR", "₹", "prefix", "DD-MM-YYYY"],
  ["ko-KR", "KRW", "₩", "prefix", "YYYY.MM.DD"],
  ["tr-TR", "TRY", "₺", "prefix", "DD.MM.YYYY"],
  ["da-DK", "DKK", "kr", "suffix", "DD-MM-YYYY"],
  ["fi-FI", "EUR", "€", "suffix", "DD.MM.YYYY"],
  ["nb-NO", "NOK", "kr", "suffix", "DD.MM.YYYY"],
  ["en-AU", "AUD", "$", "prefix", "DD/MM/YYYY"],
  ["en-CA", "CAD", "$", "prefix", "YYYY-MM-DD"],
  ["fr-CA", "CAD", "$", "suffix", "YYYY-MM-DD"],
  ["es-MX", "MXN", "$", "prefix", "DD/MM/YYYY"],
  ["es-AR", "ARS", "$", "prefix", "DD/MM/YYYY"],
  ["de-AT", "EUR", "€", "suffix", "DD.MM.YYYY"],
  ["de-CH", "CHF", "CHF", "suffix", "DD.MM.YYYY"],
  ["pt-PT", "EUR", "€", "suffix", "DD/MM/YYYY"],
  ["el-GR", "EUR", "€", "suffix", "DD/MM/YYYY"],
  ["cs-CZ", "CZK", "Kč", "suffix", "DD.MM.YYYY"],
  ["hu-HU", "HUF", "Ft", "suffix", "YYYY.MM.DD"],
  ["ro-RO", "RON", "lei", "suffix", "DD.MM.YYYY"],
  ["bg-BG", "BGN", "лв", "suffix", "DD.MM.YYYY"],
  ["uk-UA", "UAH", "₴", "suffix", "DD.MM.YYYY"],
  ["vi-VN", "VND", "₫", "suffix", "DD/MM/YYYY"],
  ["th-TH", "THB", "฿", "prefix", "DD/MM/YYYY"],
  ["id-ID", "IDR", "Rp", "prefix", "DD/MM/YYYY"],
  ["ms-MY", "MYR", "RM", "prefix", "DD/MM/YYYY"],
  ["en-IN", "INR", "₹", "prefix", "DD/MM/YYYY"],
  ["en-ZA", "ZAR", "R", "prefix", "YYYY/MM/DD"],
];

// Deterministic per-locale accent applied to a name's vowels so derived
// locales read as distinct without claiming linguistic accuracy.
const ACCENTS: Record<string, string> = { a: "á", e: "ë", i: "í", o: "ø", u: "ü" };
const SUFFIXES = ["ul", "ka", "ico", "esh", "ov", "in", "et", "as", "yo", "no"];

function deriveName(name: string, random: () => number): string {
  const chars = name.split("");
  let swapped = false;
  for (let i = chars.length - 1; i >= 0 && !swapped; i--) {
    const lower = chars[i].toLowerCase();
    const accent = ACCENTS[lower];
    if (accent) {
      chars[i] = chars[i] === lower ? accent : accent.toUpperCase();
      swapped = true;
    }
  }
  const withAccent = chars.join("");
  return random() < 0.35 ? withAccent + pick(random, SUFFIXES) : withAccent;
}

function deriveLocale(
  base: BaseLocale,
  tag: string,
  currencyCode: string,
  currencySymbol: string,
  currencyPosition: "prefix" | "suffix",
  datePattern: string,
  random: () => number,
): BaseLocale {
  return {
    tag,
    monthsLong: base.monthsLong.map((m) => deriveName(m, random)),
    monthsShort: base.monthsShort.map((m) => deriveName(m, random)),
    weekdaysLong: base.weekdaysLong.map((d) => deriveName(d, random)),
    weekdaysShort: base.weekdaysShort.map((d) => deriveName(d, random)),
    decimalSep: base.decimalSep,
    groupSep: base.groupSep,
    currencyCode,
    currencySymbol,
    currencyPosition,
    datePattern,
  };
}

function generateLocales() {
  const random = mulberry32(SEED + 1);
  const locales: BaseLocale[] = [...BASE_LOCALES];
  DERIVED_TAGS.forEach(([tag, currencyCode, currencySymbol, currencyPosition, datePattern], i) => {
    const base = BASE_LOCALES[i % BASE_LOCALES.length];
    locales.push(deriveLocale(base, tag, currencyCode, currencySymbol, currencyPosition, datePattern, random));
  });

  const entries = locales
    .map((l) => {
      const arr = (xs: string[]) => `[${xs.map((x) => JSON.stringify(x)).join(",")}]`;
      return (
        `  [${JSON.stringify(l.tag)},${arr(l.monthsLong)},${arr(l.monthsShort)},` +
        `${arr(l.weekdaysLong)},${arr(l.weekdaysShort)},${JSON.stringify(l.decimalSep)},` +
        `${JSON.stringify(l.groupSep)},${JSON.stringify(l.currencyCode)},${JSON.stringify(l.currencySymbol)},` +
        `${JSON.stringify(l.currencyPosition)},${JSON.stringify(l.datePattern)}]`
      );
    })
    .join(",\n");

  const body =
    `// A locale tuple: [tag, monthsLong, monthsShort, weekdaysLong, weekdaysShort,\n` +
    `// decimalSep, groupSep, currencyCode, currencySymbol, currencyPosition, datePattern]\n` +
    `export type LocaleTuple = [\n` +
    `  string, string[], string[], string[], string[],\n` +
    `  string, string, string, string, "prefix" | "suffix", string,\n` +
    `];\n\n` +
    `export const LOCALES: LocaleTuple[] = [\n${entries}\n];\n`;

  writeGenerated("locales.ts", body);
  return locales.length;
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

const REGIONS = ["North America", "Latin America", "Western Europe", "Eastern Europe", "Middle East", "Africa", "South Asia", "APAC"];
const CHANNELS = ["Organic Search", "Paid Search", "Social", "Email", "Referral", "Direct"];
const PRODUCTS = [
  "Starter Plan", "Pro Plan", "Team Plan", "Enterprise Plan", "Analytics Add-on", "Storage Add-on",
  "API Credits", "Priority Support", "Custom Domain", "SSO Seat", "Sandbox Env", "Data Export",
  "Audit Log Add-on", "Webhooks Add-on", "Onboarding Package", "Training Session", "Mobile Add-on",
  "Backup Add-on", "Compliance Pack", "White Label", "Reseller License", "Marketplace Listing",
  "Dedicated Instance", "Premium Support",
];

function generateDataset() {
  const random = mulberry32(SEED + 2);
  const rows: number[][] = [];

  for (let day = 0; day < 365; day++) {
    const samplesForDay = day % 5 === 0 ? 3 : 4;
    for (let s = 0; s < samplesForDay; s++) {
      const region = randInt(random, 0, REGIONS.length - 1);
      const channel = randInt(random, 0, CHANNELS.length - 1);
      const product = randInt(random, 0, PRODUCTS.length - 1);

      // Seasonal-ish wobble plus per-sample noise, so trends look real.
      const season = 1 + 0.25 * Math.sin((day / 365) * Math.PI * 2 * 3);
      const sessions = Math.round(randInt(random, 80, 4200) * season);
      const rate = 0.01 + random() * 0.07;
      const conversions = Math.min(sessions, Math.round(sessions * rate));
      const avgOrderCents = randInt(random, 1500, 24000);
      const revenueCents = conversions * avgOrderCents + randInt(random, -500, 500);

      rows.push([day, region, channel, product, sessions, conversions, Math.max(0, revenueCents)]);
    }
  }

  const rowText = rows.map((r) => `[${r.join(",")}]`).join(",\n");
  const labelArr = (xs: string[]) => `[\n${xs.map((x) => `  ${JSON.stringify(x)}`).join(",\n")},\n]`;

  const body =
    `// A dataset row tuple: [day, regionIdx, channelIdx, productIdx, sessions, conversions, revenueCents]\n` +
    `export type MetricRowTuple = [number, number, number, number, number, number, number];\n\n` +
    `export const REGIONS: string[] = ${labelArr(REGIONS)};\n\n` +
    `export const CHANNELS: string[] = ${labelArr(CHANNELS)};\n\n` +
    `export const PRODUCTS: string[] = ${labelArr(PRODUCTS)};\n\n` +
    `export const DATASET: MetricRowTuple[] = [\n${rowText}\n];\n`;

  writeGenerated("dataset.ts", body);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const PALETTE_NAMES = [
  "Aurora", "Solstice", "Nebula", "Monsoon", "Ember", "Glacier", "Meadow", "Canyon",
  "Harbor", "Twilight", "Orchard", "Lagoon", "Wildfire", "Frost", "Savanna", "Cobalt",
  "Marigold", "Basalt", "Coral Reef", "Dune",
];

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generatePalettes() {
  const random = mulberry32(SEED + 3);
  const entries = PALETTE_NAMES.map((name, i) => {
    const baseHue = (i * 37 + randInt(random, 0, 20)) % 360;
    const count = randInt(random, 8, 12);
    const colors: string[] = [];
    for (let c = 0; c < count; c++) {
      const hue = (baseHue + c * (360 / count) * 0.35 + randInt(random, -8, 8) + 360) % 360;
      const sat = 0.45 + random() * 0.4;
      const light = 0.38 + (c / count) * 0.38;
      colors.push(hslToHex(hue, sat, light));
    }
    return `  { name: ${JSON.stringify(name)}, colors: [${colors.map((c) => JSON.stringify(c)).join(",")}] }`;
  }).join(",\n");

  const body =
    `export interface Palette {\n  name: string;\n  colors: string[];\n}\n\n` +
    `export const PALETTES: Palette[] = [\n${entries}\n];\n`;

  writeGenerated("palettes.ts", body);
  return PALETTE_NAMES.length;
}

const localeCount = generateLocales();
const rowCount = generateDataset();
const paletteCount = generatePalettes();

console.log(`generated ${localeCount} locales, ${rowCount} dataset rows, ${paletteCount} palettes -> src/generated/`);
