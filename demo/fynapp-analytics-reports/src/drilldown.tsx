/**
 * Per-day breakdown for one region/channel combination: summary statistics
 * and a small trend chart. Loaded only when a report row is clicked — never
 * a federation expose, just a plain lazy chunk.
 */
import React from "react";
import {
  getDataset,
  filterRows,
  median,
  percentile,
  stddev,
  linearRegression,
  formatCurrency,
  formatDate,
  type MetricRow,
} from "analytics-core";

interface DailyPoint {
  day: number;
  revenue: number;
}

function buildDaily(rows: MetricRow[]): DailyPoint[] {
  const totals = new Map<number, number>();
  for (const row of rows) {
    totals.set(row.day, (totals.get(row.day) ?? 0) + row.revenue);
  }
  return [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([day, revenue]) => ({ day, revenue }));
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--fynmesh-color-secondary, #64748b)" }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, color: "var(--fynmesh-color-dark, #111827)" }}>{value}</div>
    </div>
  );
}

export function Drilldown({ region, channel }: { region: string; channel: string }): React.ReactElement {
  const daily = React.useMemo(() => buildDaily(filterRows(getDataset(), { region, channel })), [region, channel]);

  const values = daily.map((d) => d.revenue);
  const stats = React.useMemo(
    () => ({
      median: median(values),
      p90: percentile(values, 90),
      stddev: stddev(values),
      regression: linearRegression(daily.map((d) => [d.day, d.revenue] as [number, number])),
    }),
    [daily],
  );

  if (daily.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--fynmesh-color-secondary, #64748b)" }}>
        No daily data for {region} / {channel}.
      </div>
    );
  }

  const width = 480;
  const height = 90;
  const minDay = daily[0].day;
  const maxDay = daily[daily.length - 1].day;
  const minV = Math.min(0, ...values);
  const maxV = Math.max(...values, 1);
  const spanDay = maxDay - minDay || 1;
  const spanV = maxV - minV || 1;
  const xFor = (day: number) => ((day - minDay) / spanDay) * width;
  const yFor = (v: number) => height - ((v - minV) / spanV) * height;

  const linePoints = daily.map((d) => `${xFor(d.day).toFixed(1)},${yFor(d.revenue).toFixed(1)}`).join(" ");
  const { slope, intercept, r2 } = stats.regression;
  const trendX1 = xFor(minDay);
  const trendY1 = yFor(slope * minDay + intercept);
  const trendX2 = xFor(maxDay);
  const trendY2 = yFor(slope * maxDay + intercept);
  const trendDirection = slope >= 0 ? "+" : "−";

  return (
    <div>
      <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
        <Stat label="Median / day" value={formatCurrency(stats.median)} />
        <Stat label="P90 / day" value={formatCurrency(stats.p90)} />
        <Stat label="Std dev" value={formatCurrency(stats.stddev)} />
        <Stat
          label="Trend"
          value={`${trendDirection}${formatCurrency(Math.abs(slope))}/day (R² ${r2.toFixed(2)})`}
        />
      </div>
      <svg width={width} height={height} style={{ display: "block" }}>
        <line x1={0} y1={yFor(0)} x2={width} y2={yFor(0)} stroke="var(--fynmesh-color-secondary, #e2e8f0)" />
        <polyline points={linePoints} fill="none" stroke="var(--fynmesh-color-primary, #2563eb)" strokeWidth={1.5} />
        <line
          x1={trendX1}
          y1={trendY1}
          x2={trendX2}
          y2={trendY2}
          stroke="var(--fynmesh-color-danger, #dc2626)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      </svg>
      <div style={{ fontSize: 11, color: "var(--fynmesh-color-secondary, #64748b)", marginTop: 4 }}>
        Daily revenue for {region} / {channel}, {formatDate(minDay)}{"–"}
        {formatDate(maxDay)} ({daily.length} days)
      </div>
    </div>
  );
}
