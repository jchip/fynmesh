import React from "react";
import ReactDOM from "react-dom/client";
import { getDataset, filterRows, compareRanges, formatCompact, formatCurrency, formatPercent } from "analytics-core";
import { Header } from "./header";
import { Toolbar } from "./toolbar";
import { Filters } from "./filters";
import { DateRange } from "./date-range";
import { KpiTile } from "./kpi-tile";
import { PerfPanel } from "./perf-panel";

type ChartGridModule = { ChartGrid: React.ComponentType };
type ReportTableModule = { ReportTable: React.ComponentType };
type EmptyStateModule = { EmptyState: React.ComponentType<{ onReset: () => void }> };

function Dashboard(): React.ReactElement {
  const [region, setRegion] = React.useState<string | undefined>(undefined);
  const [channel, setChannel] = React.useState<string | undefined>(undefined);
  const [days, setDays] = React.useState(30);

  const [ChartGrid, setChartGrid] = React.useState<React.ComponentType | null>(null);
  const [ReportTable, setReportTable] = React.useState<React.ComponentType | null>(null);
  const [EmptyState, setEmptyState] = React.useState<EmptyStateModule["EmptyState"] | null>(null);
  const [ready, setReady] = React.useState(false);
  const readyMarked = React.useRef(false);

  const rows = React.useMemo(() => getDataset(), []);
  const filtered = React.useMemo(() => filterRows(rows, { region, channel }), [rows, region, channel]);
  const comparison = React.useMemo(() => compareRanges(filtered, days), [filtered, days]);
  const isEmpty = filtered.length === 0;

  // Static-shaped charts widget: statically declared exposed module, loaded once on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // @ts-ignore - TS can't understand module federation remote containers
      const mod = (await import("fynapp-analytics-charts/grid", {
        with: { type: "mf-expose", semver: "^1.0.0" },
      })) as ChartGridModule;
      if (!cancelled) setChartGrid(() => mod.ChartGrid);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ready mark: once the charts module has resolved (KPI tiles are already
  // rendered by then), wait one paint and mark perf-lab:ready exactly once.
  React.useEffect(() => {
    if (!ChartGrid || readyMarked.current) return;
    readyMarked.current = true;
    requestAnimationFrame(() => {
      performance.mark("perf-lab:ready");
      setReady(true);
    });
  }, [ChartGrid]);

  // Reports widget: loaded at browser idle, after the ready mark.
  React.useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const load = async () => {
      // @ts-ignore - TS can't understand module federation remote containers
      const mod = (await import("fynapp-analytics-reports/table", {
        with: { type: "mf-expose", semver: "^1.0.0" },
      })) as ReportTableModule;
      if (!cancelled) setReportTable(() => mod.ReportTable);
    };
    const ric = (globalThis as any).requestIdleCallback;
    if (typeof ric === "function") {
      const id = ric(() => void load());
      return () => {
        cancelled = true;
        (globalThis as any).cancelIdleCallback?.(id);
      };
    }
    const timer = setTimeout(() => void load(), 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready]);

  // Empty state: only fetched the first time the filtered dataset is empty.
  React.useEffect(() => {
    if (!isEmpty || EmptyState) return;
    let cancelled = false;
    import("./empty-state").then((mod) => {
      if (!cancelled) setEmptyState(() => (mod as EmptyStateModule).EmptyState);
    });
    return () => {
      cancelled = true;
    };
  }, [isEmpty, EmptyState]);

  const resetFilters = () => {
    setRegion(undefined);
    setChannel(undefined);
  };

  return (
    <div style={{ padding: 16, fontFamily: "var(--fynmesh-font-family-sans, system-ui, sans-serif)" }}>
      <PerfPanel />
      <Header />
      <Toolbar>
        <DateRange days={days} onChange={setDays} />
        <Filters region={region} channel={channel} onRegionChange={setRegion} onChannelChange={setChannel} />
      </Toolbar>

      {isEmpty ? (
        EmptyState && <EmptyState onReset={resetFilters} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
          <KpiTile label="Revenue" value={formatCurrency(comparison.current.revenue)} delta={comparison.deltas.revenue} />
          <KpiTile label="Sessions" value={formatCompact(comparison.current.sessions)} delta={comparison.deltas.sessions} />
          <KpiTile
            label="Conversion rate"
            value={formatPercent(comparison.current.conversionRate)}
            delta={comparison.deltas.conversionRate}
          />
          <KpiTile
            label="Avg. order value"
            value={formatCurrency(comparison.current.avgOrderValue)}
            delta={comparison.deltas.avgOrderValue}
          />
        </div>
      )}

      {ChartGrid ? <ChartGrid /> : <div style={{ fontSize: 12, color: "var(--fynmesh-color-secondary, #64748b)" }}>Loading charts…</div>}

      <div style={{ marginTop: 16 }}>{ReportTable && <ReportTable />}</div>
    </div>
  );
}

function DashboardWrapper(_props: { fynApp?: unknown; runtime?: unknown }): React.ReactElement {
  return <Dashboard />;
}

// Component export for shell rendering, matching the fynapp-sidebar pattern.
export const component = {
  type: "react" as const,
  component: DashboardWrapper,
  react: React,
  reactDOM: ReactDOM,
  metadata: {
    name: "FynApp Analytics",
    version: "1.0.0",
    description: "Perf Lab analytics dashboard",
  },
};
