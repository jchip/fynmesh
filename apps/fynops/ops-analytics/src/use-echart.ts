import { useEffect, useRef, type RefObject } from "react";
// Typed through the tsconfig path to echarts; the code comes from fynops-charts-lib.
import * as echarts from "esm-echarts";

/**
 * Creates and disposes one echarts instance for a container div, and keeps it
 * sized to the container. A ResizeObserver covers both an ordinary window
 * resize and the shell showing this route again after hiding it (the hidden
 * container has no size, so it needs a resize once it's visible again).
 *
 * Callers set the chart's data with `chartRef.current?.setOption(...)` from
 * their own effect; this hook only owns the instance's lifecycle.
 */
export function useEChart(
  containerRef: RefObject<HTMLDivElement | null>,
): RefObject<echarts.ECharts | undefined> {
  const chartRef = useRef<echarts.ECharts>(undefined);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return chartRef;
}
