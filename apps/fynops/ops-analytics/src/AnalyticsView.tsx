import React, { useEffect, useMemo, useState } from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import { Panel, StatTile } from "fynops-ui-kit";
import {
  fynopsData,
  TOPIC_VEHICLE_POSITIONS,
  type LaneCostRow,
  type OnTimeRow,
  type TrendRow,
  type VehiclePosition,
  type VehiclePositionsTick,
} from "fynops-data-core";
import { OnTimeByCarrierChart, LaneCostChart, StatusMixDonut, TrendChart } from "./charts";
import { formatCurrency, formatInt, formatPercent } from "./format";

interface Loaded {
  onTimeByCarrier: OnTimeRow[];
  laneCost: LaneCostRow[];
  trend: TrendRow[];
  delayedShipments: number;
}

/**
 * Analytics: four KPI tiles plus four echarts charts, all fed by
 * fynopsData.analytics.*. Vehicle status (the in-transit tile and the status
 * mix donut) comes off the ops:vehicle.positions bus, once per second; the
 * rest is a one-time snapshot from the analytics calls (there is no live
 * "on-time" concept in a vehicle position -- see the task summary).
 */
export const AnalyticsView: React.FC<{ runtime: FynUnitRuntime }> = ({ runtime }) => {
  const [data, setData] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([
      fynopsData.analytics.onTime("carrier"),
      fynopsData.analytics.laneCost({ limit: 10 }),
      fynopsData.analytics.trend(30),
      fynopsData.query<{ n: number }>("SELECT count(*) AS n FROM shipments WHERE status = 'delayed'"),
      fynopsData.vehicles.positions(),
    ]).then(
      ([onTimeByCarrier, laneCost, trend, delayedRows, positions]) => {
        if (!live) return;
        setData({ onTimeByCarrier, laneCost, trend, delayedShipments: delayedRows[0]?.n ?? 0 });
        setVehicles(positions);
      },
      (err: Error) => live && setError(err.message),
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!runtime.bus) return;
    return runtime.bus.on<VehiclePositionsTick>(TOPIC_VEHICLE_POSITIONS, (tick) => setVehicles(tick.vehicles));
  }, [runtime]);

  const inTransit = useMemo(() => vehicles.filter((v) => v.status === "en_route").length, [vehicles]);

  const onTimeRate = useMemo(() => {
    if (!data) return undefined;
    const delivered = data.onTimeByCarrier.reduce((sum, r) => sum + r.delivered, 0);
    const onTime = data.onTimeByCarrier.reduce((sum, r) => sum + r.on_time, 0);
    return delivered ? onTime / delivered : 0;
  }, [data]);

  const avgLaneCost = useMemo(() => {
    if (!data || data.laneCost.length === 0) return undefined;
    return data.laneCost.reduce((sum, r) => sum + r.avg_rate_usd, 0) / data.laneCost.length;
  }, [data]);

  if (error) {
    return <div className="ops-an-error">Could not load analytics: {error}</div>;
  }

  return (
    <div className="ops-an" data-testid="ops-an-view">
      <div className="ops-an-tiles">
        <StatTile label="On-time rate" value={onTimeRate === undefined ? "..." : formatPercent(onTimeRate)} />
        <StatTile
          label="Delayed shipments"
          value={data === undefined ? "..." : formatInt(data.delayedShipments)}
        />
        <StatTile label="Vehicles in transit" value={formatInt(inTransit)} />
        <StatTile label="Avg lane cost" value={avgLaneCost === undefined ? "..." : formatCurrency(avgLaneCost)} />
      </div>
      <div className="ops-an-charts">
        <Panel title="On-time rate by carrier">
          <OnTimeByCarrierChart rows={data?.onTimeByCarrier ?? []} />
        </Panel>
        <Panel title="Lane cost (top 10)">
          <LaneCostChart rows={data?.laneCost ?? []} />
        </Panel>
        <Panel title="30-day shipment trend">
          <TrendChart rows={data?.trend ?? []} />
        </Panel>
        <Panel title="Vehicle status mix">
          <StatusMixDonut vehicles={vehicles} />
        </Panel>
      </div>
    </div>
  );
};
