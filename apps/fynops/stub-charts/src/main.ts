import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import type { EChartsType } from "echarts";
// @ts-ignore - esm wrapper, resolved at runtime via federation share
import * as echarts from "esm-echarts";

interface Shipment {
  day: string;
  lane: string;
  count: number;
  cost: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LANES = ["LAX-ORD", "DFW-ATL", "SEA-DEN", "MIA-JFK"];

function makeShipments(): Shipment[] {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return DAYS.flatMap((day) =>
    LANES.map((lane) => ({
      day,
      lane,
      count: Math.round(20 + rand() * 60),
      cost: Math.round(800 + rand() * 1200),
    })),
  );
}

/**
 * Phase 1 stub: two echarts charts (line, bar) fed by made-up shipment data,
 * drawing on the shared `esm-echarts` module federation provides from
 * fynops-charts-lib. Confirms echarts downloads once for multiple consumers.
 */
class StubCharts implements FynUnit {
  private line?: EChartsType;
  private bar?: EChartsType;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(_runtime: FynUnitRuntime) {
    const shipments = makeShipments();

    const target = document.createElement("div");
    target.id = "stub-charts";
    target.innerHTML = `
      <div data-testid="chart-stats" style="font:13px system-ui;padding:4px 8px">echarts ${echarts.version}</div>
      <div class="line-chart" style="width:100%;height:320px"></div>
      <div class="bar-chart" style="width:100%;height:320px"></div>`;
    document.body.appendChild(target);

    const shipmentsPerDay = DAYS.map((day) =>
      shipments.filter((s) => s.day === day).reduce((sum, s) => sum + s.count, 0),
    );
    const costByLane = LANES.map((lane) =>
      shipments.filter((s) => s.lane === lane).reduce((sum, s) => sum + s.cost, 0),
    );

    this.line = echarts.init(target.querySelector<HTMLElement>(".line-chart")!);
    this.line.setOption({
      title: { text: "Shipments per day" },
      tooltip: {},
      xAxis: { type: "category", data: DAYS },
      yAxis: { type: "value" },
      series: [{ type: "line", data: shipmentsPerDay }],
    });

    this.bar = echarts.init(target.querySelector<HTMLElement>(".bar-chart")!);
    this.bar.setOption({
      title: { text: "Shipment cost by lane" },
      tooltip: {},
      xAxis: { type: "category", data: LANES },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: costByLane }],
    });

    return {
      type: "self-managed" as const,
      target,
      cleanup: () => this.shutdown(),
      metadata: { framework: "vanilla", capabilities: ["self-managed"] },
    };
  }

  shutdown(): void {
    this.line?.dispose();
    this.bar?.dispose();
    this.line = undefined;
    this.bar = undefined;
  }
}

export const main = new StubCharts();
