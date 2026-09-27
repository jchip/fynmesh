import React, { useEffect, useRef } from "react";
import type { LaneCostRow, OnTimeRow, TrendRow, VehiclePosition } from "fynops-data-core";
import { useEChart } from "./use-echart";
import { readChartTheme, VEHICLE_STATUS_META, VEHICLE_STATUS_ORDER } from "./theme";
import { formatCurrency, formatPercent } from "./format";

/** Vertical bar: on-time rate per carrier, highest first. */
export const OnTimeByCarrierChart: React.FC<{ rows: OnTimeRow[] }> = ({ rows }) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useEChart(ref);

  useEffect(() => {
    const chart = chartRef.current;
    const el = ref.current;
    if (!chart || !el) return;
    const theme = readChartTheme(el);
    const sorted = [...rows].sort((a, b) => b.on_time_rate - a.on_time_rate);
    chart.setOption({
      grid: { left: 48, right: 16, top: 16, bottom: 78, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: theme.surface,
        borderColor: theme.border,
        textStyle: { color: theme.text },
        formatter: (params: any) => {
          const row = sorted[params[0].dataIndex];
          return `${row.key}<br/>${formatPercent(row.on_time_rate)} on time (${row.delivered} delivered)`;
        },
      },
      xAxis: {
        type: "category",
        data: sorted.map((r) => r.key),
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted, rotate: 45, interval: 0 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        max: 100,
        axisLabel: { color: theme.textMuted, formatter: "{value}%" },
        splitLine: { lineStyle: { color: theme.border } },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((r) => Math.round(r.on_time_rate * 1000) / 10),
          barMaxWidth: 24,
          itemStyle: { color: theme.primary, borderRadius: [4, 4, 0, 0] },
        },
      ],
    });
  }, [rows, chartRef]);

  return <div ref={ref} className="ops-an-chart" data-testid="ops-an-chart-carrier" />;
};

/** Horizontal bar: avg cost on the busiest lanes, busiest lane on top. */
export const LaneCostChart: React.FC<{ rows: LaneCostRow[] }> = ({ rows }) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useEChart(ref);

  useEffect(() => {
    const chart = chartRef.current;
    const el = ref.current;
    if (!chart || !el) return;
    const theme = readChartTheme(el);
    const ordered = [...rows].reverse();
    chart.setOption({
      grid: { left: 72, right: 72, top: 16, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: theme.surface,
        borderColor: theme.border,
        textStyle: { color: theme.text },
        formatter: (params: any) => {
          const row = ordered[params[0].dataIndex];
          return `${row.lane}<br/>${formatCurrency(row.avg_rate_usd)} avg (${row.shipments} shipments)`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { color: theme.textMuted, formatter: (v: number) => formatCurrency(v) },
        splitLine: { lineStyle: { color: theme.border } },
      },
      yAxis: {
        type: "category",
        data: ordered.map((r) => r.lane),
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: ordered.map((r) => r.avg_rate_usd),
          barMaxWidth: 24,
          itemStyle: { color: theme.primary, borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            color: theme.text,
            formatter: (p: any) => formatCurrency(p.value),
          },
        },
      ],
    });
  }, [rows, chartRef]);

  return <div ref={ref} className="ops-an-chart" data-testid="ops-an-chart-lane-cost" />;
};

/** Line: shipments picked up per day, over the dataset's last 30 days. */
export const TrendChart: React.FC<{ rows: TrendRow[] }> = ({ rows }) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useEChart(ref);

  useEffect(() => {
    const chart = chartRef.current;
    const el = ref.current;
    if (!chart || !el) return;
    const theme = readChartTheme(el);
    chart.setOption({
      grid: { left: 48, right: 56, top: 16, bottom: 40, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: theme.surface,
        borderColor: theme.border,
        textStyle: { color: theme.text },
      },
      xAxis: {
        type: "category",
        data: rows.map((r) => r.day.slice(5)),
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: theme.textMuted },
        splitLine: { lineStyle: { color: theme.border } },
      },
      series: [
        {
          type: "line",
          data: rows.map((r) => r.shipments),
          showSymbol: false,
          lineStyle: { width: 2, color: theme.primary },
          areaStyle: { color: theme.primary, opacity: 0.1 },
          endLabel: { show: true, formatter: "{c}", color: theme.text },
        },
      ],
    });
  }, [rows, chartRef]);

  return <div ref={ref} className="ops-an-chart" data-testid="ops-an-chart-trend" />;
};

/** Donut: current vehicle status mix, live off the position bus. */
export const StatusMixDonut: React.FC<{ vehicles: VehiclePosition[] }> = ({ vehicles }) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useEChart(ref);

  useEffect(() => {
    const chart = chartRef.current;
    const el = ref.current;
    if (!chart || !el) return;
    const theme = readChartTheme(el);

    const counts = new Map<string, number>();
    for (const v of vehicles) counts.set(v.status, (counts.get(v.status) ?? 0) + 1);
    const known = new Set(VEHICLE_STATUS_ORDER);
    const order = [...VEHICLE_STATUS_ORDER, ...[...counts.keys()].filter((s) => !known.has(s))];
    const data = order
      .filter((status) => counts.has(status))
      .map((status) => {
        const meta = VEHICLE_STATUS_META[status] ?? { label: status, colorKey: "textMuted" as const };
        return { name: meta.label, value: counts.get(status) ?? 0, itemStyle: { color: theme[meta.colorKey] } };
      });

    chart.setOption({
      tooltip: {
        trigger: "item",
        backgroundColor: theme.surface,
        borderColor: theme.border,
        textStyle: { color: theme.text },
      },
      legend: {
        bottom: 0,
        icon: "circle",
        textStyle: { color: theme.text },
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: theme.surface, borderWidth: 2 },
          label: { show: true, color: theme.text, formatter: "{b}\n{d}%" },
          labelLine: { lineStyle: { color: theme.border } },
          data,
        },
      ],
    });
  }, [vehicles, chartRef]);

  return <div ref={ref} className="ops-an-chart" data-testid="ops-an-chart-status-mix" />;
};
