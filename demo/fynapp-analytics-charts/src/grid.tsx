/**
 * The dashboard's chart grid: revenue trend, sessions, revenue by channel and
 * revenue by region, built from analytics-core data and the `./renderer`
 * chart engine. The Export button lazy-loads `./export` only on click.
 */
import React from "react";
import {
  getDataset,
  timeSeries,
  groupBy,
  movingAverage,
  PALETTES,
  formatCompact,
  formatCurrency,
  formatDate,
} from "analytics-core";
import { LineChart, AreaChart, GroupedBarChart, DonutChart, assignColors } from "./renderer";

const MOVING_AVERAGE_WINDOW = 4;

const formatRevenue = (cents: number): string => `$${formatCompact(cents / 100)}`;
const formatRevenueExact = (cents: number): string => formatCurrency(cents);
const formatWeek = (weekIndex: number): string => formatDate(weekIndex * 7, undefined, "short");

export function ChartGrid(): React.ReactElement {
  const rows = React.useMemo(() => getDataset(), []);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const revenueByWeek = React.useMemo(() => timeSeries(rows, "revenue", "week"), [rows]);
  const sessionsByWeek = React.useMemo(() => timeSeries(rows, "sessions", "week"), [rows]);
  const revenueByChannel = React.useMemo(() => groupBy(rows, "channel", "revenue"), [rows]);
  const revenueByRegion = React.useMemo(() => groupBy(rows, "region", "revenue"), [rows]);

  const revenueMovingAverage = React.useMemo(
    () => movingAverage(revenueByWeek.map((p) => p.v), MOVING_AVERAGE_WINDOW),
    [revenueByWeek],
  );

  const regionColors = React.useMemo(
    () => assignColors(revenueByRegion.map((r) => r.key), PALETTES[1]?.colors ?? []),
    [revenueByRegion],
  );

  const totalRegionRevenue = revenueByRegion.reduce((sum, r) => sum + r.value, 0);

  const handleExport = React.useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const mod = await import("./export");
      const csv = mod.toMultiTableCsv([
        { label: "revenue_by_week", rows: revenueByWeek.map((p) => ({ week: p.t, revenue_cents: p.v })) },
        { label: "sessions_by_week", rows: sessionsByWeek.map((p) => ({ week: p.t, sessions: p.v })) },
        { label: "revenue_by_channel", rows: revenueByChannel.map((r) => ({ channel: r.key, revenue_cents: r.value })) },
        { label: "revenue_by_region", rows: revenueByRegion.map((r) => ({ region: r.key, revenue_cents: r.value })) },
      ]);
      mod.downloadText(csv, mod.stampedFilename("analytics-charts", "csv"), "text/csv;charset=utf-8");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "export failed");
    } finally {
      setExporting(false);
    }
  }, [revenueByWeek, sessionsByWeek, revenueByChannel, revenueByRegion]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--fynmesh-color-danger, #dc2626)" }}>{exportError}</span>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: "6px 14px",
            background: "var(--fynmesh-color-primary, #2563eb)",
            color: "var(--fynmesh-color-light, #ffffff)",
            border: "none",
            borderRadius: "var(--fynmesh-radius-md, 6px)",
            boxShadow: "var(--fynmesh-shadow-sm, 0 1px 2px rgba(0,0,0,0.1))",
            cursor: exporting ? "not-allowed" : "pointer",
            fontSize: 13,
            opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <LineChart
          title={`Revenue by week (${MOVING_AVERAGE_WINDOW}-week moving average)`}
          series={[
            {
              id: "revenue",
              label: "Revenue",
              color: "var(--fynmesh-color-primary, #2563eb)",
              points: revenueByWeek,
            },
            {
              id: "moving-average",
              label: "Moving average",
              color: "var(--fynmesh-color-secondary, #64748b)",
              points: revenueByWeek.map((p, i) => ({ t: p.t, v: revenueMovingAverage[i] })),
              dashed: true,
            },
          ]}
          formatX={formatWeek}
          formatY={formatRevenue}
        />
        <AreaChart
          title="Sessions by week"
          points={sessionsByWeek}
          color="var(--fynmesh-color-info, #0ea5e9)"
          formatX={formatWeek}
          formatY={formatCompact}
        />
        <GroupedBarChart
          title="Revenue by channel"
          categories={revenueByChannel.map((r) => r.key)}
          series={[
            {
              id: "revenue",
              label: "Revenue",
              color: "var(--fynmesh-color-primary, #2563eb)",
              values: revenueByChannel.map((r) => r.value),
            },
          ]}
          formatY={formatRevenue}
        />
        <DonutChart
          title="Revenue by region"
          segments={revenueByRegion.map((r) => ({
            key: r.key,
            label: r.key,
            value: r.value,
            color: regionColors[r.key],
          }))}
          formatValue={formatRevenueExact}
          centerLabel={formatRevenue(totalRegionRevenue)}
        />
      </div>
    </div>
  );
}
