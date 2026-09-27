import React, { useEffect, useRef, useState } from "react";
import type { ICellRendererParams } from "ag-grid-community";
// Typed through the tsconfig path to echarts; the code comes from fynops-charts-lib.
import * as echarts from "esm-echarts";
import { fynopsData } from "fynops-data-core";

/** Weekly on-time rate (0..1, or null for a week with no deliveries), per lane. */
export type LaneTrends = Map<string, Array<number | null>>;

// Delivered shipments bucketed by pickup week. The lane key matches the
// grid's `lane` column ("CHI-DAL"). ~36 shipments per lane at 10k, so weeks,
// not days, keep the line readable.
const TREND_SQL =
  "WITH start AS (SELECT julianday(min(substr(pickup_at, 1, 10))) AS day0 FROM shipments)" +
  " SELECT (o.code || '-' || d.code) AS lane," +
  " CAST((julianday(substr(s.pickup_at, 1, 10)) - start.day0) / 7 AS INTEGER) AS week," +
  " count(*) AS delivered, sum(s.delivered_at <= s.due_at) AS on_time" +
  " FROM shipments s JOIN lanes l ON l.id = s.lane_id" +
  " JOIN warehouses o ON o.id = l.origin_id JOIN warehouses d ON d.id = l.destination_id, start" +
  " WHERE s.status = 'delivered' AND s.delivered_at IS NOT NULL" +
  " GROUP BY lane, week ORDER BY lane, week";

let trends: Promise<LaneTrends> | undefined;

/** Loaded once per page, then shared by every visible sparkline. */
export function loadLaneTrends(): Promise<LaneTrends> {
  trends ??= fynopsData
    .query<{ lane: string; week: number; delivered: number; on_time: number }>(TREND_SQL)
    .then((rows) => {
      const weeks = rows.reduce((max, r) => Math.max(max, r.week), 0) + 1;
      const byLane: LaneTrends = new Map();
      for (const r of rows) {
        let series = byLane.get(r.lane);
        if (!series) byLane.set(r.lane, (series = new Array(weeks).fill(null)));
        series[r.week] = r.delivered ? r.on_time / r.delivered : null;
      }
      return byLane;
    })
    .catch((err) => {
      trends = undefined;
      throw err;
    });
  return trends;
}

/**
 * Cell renderer for the trend column. It draws only in lane group rows, and
 * ag-grid only renders cells for visible rows, so charts exist only for rows
 * on screen. Each chart is disposed when its cell is destroyed.
 */
export const LaneTrendCell: React.FC<ICellRendererParams> = ({ node }) => {
  const ref = useRef<HTMLDivElement>(null);
  const lane = node.group && node.field === "lane" ? String(node.key) : undefined;
  const [series, setSeries] = useState<Array<number | null>>();

  useEffect(() => {
    if (!lane) return;
    let live = true;
    loadLaneTrends().then((all) => live && setSeries(all.get(lane) ?? []), () => {});
    return () => {
      live = false;
    };
  }, [lane]);

  useEffect(() => {
    if (!ref.current || !series) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg", width: 120, height: 26 });
    chart.setOption({
      animation: false,
      grid: { left: 1, right: 1, top: 2, bottom: 2 },
      xAxis: { type: "category", show: false, data: series.map((_, i) => i) },
      yAxis: { type: "value", show: false, min: 0, max: 1 },
      tooltip: { show: false },
      series: [
        {
          type: "line",
          data: series.map((v) => (v === null ? null : Math.round(v * 100) / 100)),
          connectNulls: true,
          symbol: "none",
          lineStyle: { width: 1.5, color: "#4f46e5" },
          areaStyle: { color: "rgba(79, 70, 229, 0.12)" },
        },
      ],
    });
    return () => chart.dispose();
  }, [series]);

  if (!lane) return null;
  const known = series?.filter((v): v is number => v !== null) ?? [];
  const title = known.length
    ? `Weekly on-time rate, last week ${Math.round(known[known.length - 1] * 100)}%`
    : "No deliveries yet";
  return <div ref={ref} className="ops-sh-spark" title={title} data-testid="ops-sh-spark" />;
};
