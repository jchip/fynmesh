/**
 * A sortable, paginated pivot report: region x channel totals, with a
 * per-row sparkline. Clicking a row lazy-loads `./drilldown` (not a
 * federation expose, just a plain code-split chunk) and expands it inline.
 */
import React from "react";
import {
  getDataset,
  timeSeries,
  summarize,
  formatCompact,
  formatCurrency,
  formatPercent,
  type MetricRow,
  type Summary,
} from "analytics-core";

interface PivotRow extends Summary {
  region: string;
  channel: string;
  sparkline: number[];
}

function buildPivot(rows: MetricRow[]): PivotRow[] {
  const groups = new Map<string, MetricRow[]>();
  for (const row of rows) {
    const key = `${row.region}::${row.channel}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(row);
  }
  return [...groups.entries()].map(([key, groupRows]) => {
    const [region, channel] = key.split("::");
    return {
      region,
      channel,
      ...summarize(groupRows),
      sparkline: timeSeries(groupRows, "revenue", "week").map((p) => p.v),
    };
  });
}

type SortKey = "region" | "channel" | "revenue" | "sessions" | "conversionRate" | "avgOrderValue";
type SortDirection = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "region", label: "Region", align: "left" },
  { key: "channel", label: "Channel", align: "left" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "sessions", label: "Sessions", align: "right" },
  { key: "conversionRate", label: "Conv. rate", align: "right" },
  { key: "avgOrderValue", label: "AOV", align: "right" },
];

const PAGE_SIZE = 8;

function Sparkline({ values, color }: { values: number[]; color: string }): React.ReactElement {
  const width = 64;
  const height = 20;
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }): React.ReactElement | null {
  if (!active) return null;
  return <span style={{ marginLeft: 4 }}>{direction === "asc" ? "▲" : "▼"}</span>;
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  cursor: "pointer",
  userSelect: "none",
  borderBottom: "2px solid var(--fynmesh-color-secondary, #e2e8f0)",
  color: "var(--fynmesh-color-dark, #374151)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--fynmesh-color-secondary, #f1f5f9)",
};

const paginationButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid var(--fynmesh-color-secondary, #cbd5e1)",
  borderRadius: "var(--fynmesh-radius-md, 6px)",
  background: "var(--fynmesh-color-light, #ffffff)",
  cursor: "pointer",
  fontSize: 12,
};

export function ReportTable(): React.ReactElement {
  const pivot = React.useMemo(() => buildPivot(getDataset()), []);
  const [sortKey, setSortKey] = React.useState<SortKey>("revenue");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [page, setPage] = React.useState(0);
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const [DrilldownComponent, setDrilldownComponent] = React.useState<React.ComponentType<{
    region: string;
    channel: string;
  }> | null>(null);
  const [loadingDrilldown, setLoadingDrilldown] = React.useState(false);

  const sorted = React.useMemo(() => {
    const copy = [...pivot];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [pivot, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalRevenue = pivot.reduce((a, r) => a + r.revenue, 0);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
    setPage(0);
  };

  const handleRowClick = async (row: PivotRow) => {
    const key = `${row.region}::${row.channel}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    if (!DrilldownComponent) {
      setLoadingDrilldown(true);
      try {
        const mod = await import("./drilldown");
        setDrilldownComponent(() => mod.Drilldown);
      } finally {
        setLoadingDrilldown(false);
      }
    }
  };

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} style={{ ...thStyle, textAlign: col.align }} onClick={() => handleSort(col.key)}>
                {col.label}
                <SortIndicator active={sortKey === col.key} direction={sortDirection} />
              </th>
            ))}
            <th style={thStyle}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((row) => {
            const key = `${row.region}::${row.channel}`;
            const expanded = expandedKey === key;
            return (
              <React.Fragment key={key}>
                <tr
                  onClick={() => handleRowClick(row)}
                  style={{
                    cursor: "pointer",
                    background: expanded ? "var(--fynmesh-color-secondary, #f1f5f9)" : undefined,
                  }}
                >
                  <td style={tdStyle}>{row.region}</td>
                  <td style={tdStyle}>{row.channel}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(row.revenue)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatCompact(row.sessions)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatPercent(row.conversionRate)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(row.avgOrderValue)}</td>
                  <td style={tdStyle}>
                    <Sparkline values={row.sparkline} color="var(--fynmesh-color-primary, #2563eb)" />
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 1}
                      style={{ padding: "12px 10px", background: "var(--fynmesh-color-secondary, #f8fafc)" }}
                    >
                      {DrilldownComponent ? (
                        <DrilldownComponent region={row.region} channel={row.channel} />
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--fynmesh-color-secondary, #64748b)" }}>
                          {loadingDrilldown ? "Loading drilldown…" : null}
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ ...tdStyle, fontWeight: 600, borderBottom: "none" }}>
              Total ({pivot.length} combinations)
            </td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, borderBottom: "none" }}>
              {formatCurrency(totalRevenue)}
            </td>
            <td colSpan={4} style={{ borderBottom: "none" }} />
          </tr>
        </tfoot>
      </table>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          style={paginationButtonStyle}
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Prev
        </button>
        <span style={{ fontSize: 12, color: "var(--fynmesh-color-dark, #374151)" }}>
          Page {page + 1} of {pageCount}
        </span>
        <button
          type="button"
          style={paginationButtonStyle}
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
