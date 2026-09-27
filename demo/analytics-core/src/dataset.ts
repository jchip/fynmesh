import { DATASET, REGIONS, CHANNELS, PRODUCTS } from "./generated/dataset.js";

export interface MetricRow {
  day: number;
  region: string;
  channel: string;
  product: string;
  sessions: number;
  conversions: number;
  revenue: number; // cents
}

let cache: MetricRow[] | null = null;

/** Decodes the generated tuple dataset into rows once, then memoizes. */
export function getDataset(): MetricRow[] {
  if (!cache) {
    cache = DATASET.map(([day, region, channel, product, sessions, conversions, revenue]) => ({
      day,
      region: REGIONS[region],
      channel: CHANNELS[channel],
      product: PRODUCTS[product],
      sessions,
      conversions,
      revenue,
    }));
  }
  return cache;
}

export interface RowFilter {
  region?: string;
  channel?: string;
  fromDay?: number;
  toDay?: number;
}

export function filterRows(rows: MetricRow[], filter: RowFilter): MetricRow[] {
  return rows.filter((r) => {
    if (filter.region !== undefined && r.region !== filter.region) return false;
    if (filter.channel !== undefined && r.channel !== filter.channel) return false;
    if (filter.fromDay !== undefined && r.day < filter.fromDay) return false;
    if (filter.toDay !== undefined && r.day > filter.toDay) return false;
    return true;
  });
}

export type MetricKey = "region" | "channel" | "product";
export type MetricName = "sessions" | "conversions" | "revenue";

export function groupBy(
  rows: MetricRow[],
  key: MetricKey,
  metric: MetricName,
): Array<{ key: string; value: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const k = row[key];
    totals.set(k, (totals.get(k) ?? 0) + row[metric]);
  }
  return [...totals.entries()]
    .map(([groupKey, value]) => ({ key: groupKey, value }))
    .sort((a, b) => b.value - a.value);
}

export function timeSeries(
  rows: MetricRow[],
  metric: MetricName,
  bucket: "day" | "week",
): Array<{ t: number; v: number }> {
  const totals = new Map<number, number>();
  for (const row of rows) {
    const t = bucket === "week" ? Math.floor(row.day / 7) : row.day;
    totals.set(t, (totals.get(t) ?? 0) + row[metric]);
  }
  return [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

export interface Summary {
  revenue: number;
  sessions: number;
  conversions: number;
  conversionRate: number;
  avgOrderValue: number;
}

export function summarize(rows: MetricRow[]): Summary {
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  const sessions = rows.reduce((a, r) => a + r.sessions, 0);
  const conversions = rows.reduce((a, r) => a + r.conversions, 0);
  const conversionRate = sessions === 0 ? 0 : conversions / sessions;
  const avgOrderValue = conversions === 0 ? 0 : revenue / conversions;
  return { revenue, sessions, conversions, conversionRate, avgOrderValue };
}

export interface RangeComparison {
  current: Summary;
  previous: Summary;
  deltas: {
    revenue: number;
    sessions: number;
    conversions: number;
    conversionRate: number;
    avgOrderValue: number;
  };
}

/** Compares the last `days` of rows against the `days` before that, as relative deltas. */
export function compareRanges(rows: MetricRow[], days: number): RangeComparison {
  const maxDay = rows.reduce((a, r) => Math.max(a, r.day), 0);
  const current = summarize(filterRows(rows, { fromDay: maxDay - days + 1, toDay: maxDay }));
  const previous = summarize(
    filterRows(rows, { fromDay: maxDay - days * 2 + 1, toDay: maxDay - days }),
  );
  const delta = (a: number, b: number) => (b === 0 ? 0 : (a - b) / b);
  return {
    current,
    previous,
    deltas: {
      revenue: delta(current.revenue, previous.revenue),
      sessions: delta(current.sessions, previous.sessions),
      conversions: delta(current.conversions, previous.conversions),
      conversionRate: delta(current.conversionRate, previous.conversionRate),
      avgOrderValue: delta(current.avgOrderValue, previous.avgOrderValue),
    },
  };
}
