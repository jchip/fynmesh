import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import {
  fynopsData,
  TOPIC_SHIPMENT_GET,
  TOPIC_VEHICLE_POSITIONS,
  type DataStatus,
  type ServerSideRowsRequest,
  type ShipmentDetail,
  type ShipmentGetRequest,
  type VehiclePositionsTick,
} from "fynops-data-core";

/**
 * Spike consumer for fynops-data. Plain DOM, so the only moving parts under
 * test are the shared client, its worker, and fynops-data's bus topics.
 *
 * Positions come from the `ops:vehicle.positions` bus topic, and the shipment
 * detail from an `ops:shipment.get` bus request, never by polling the client.
 */
const LANE = { id: "lane", field: "lane", displayName: "Lane" };
const CARRIER = { id: "carrier", field: "carrier", displayName: "Carrier" };
const SUMS = [
  { id: "rate_usd", field: "rate_usd", aggFunc: "sum" },
  { id: "weight_lbs", field: "weight_lbs", aggFunc: "avg" },
];

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const result = await fn();
  return [result, Math.round((performance.now() - t) * 10) / 10];
}

class SpikeData implements FynUnit {
  private stops: Array<() => void> = [];

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(runtime: FynUnitRuntime) {
    let target = document.getElementById("spike-data");
    if (!target) {
      target = document.createElement("div");
      target.id = "spike-data";
      target.style.cssText = "font-family: system-ui, sans-serif; padding: 0 2rem 2rem;";
      document.body.appendChild(target);
    }
    target.innerHTML = `
      <h2>spike-data</h2>
      <p><button data-action="reset">Reset data</button> <button data-action="rerun">Re-run queries</button></p>
      <pre data-testid="spike-data-status">starting...</pre>
      <h3>Positions (bus: ${TOPIC_VEHICLE_POSITIONS})</h3>
      <pre data-testid="spike-data-positions">waiting for a tick...</pre>
      <h3>rows(): lanes, then carriers under the first lane</h3>
      <pre data-testid="spike-data-groups"></pre>
      <h3>rows(): delayed leaf rows over 20,000 lbs, heaviest first</h3>
      <pre data-testid="spike-data-leaves"></pre>
      <h3>Shipment detail (bus: ${TOPIC_SHIPMENT_GET})</h3>
      <pre data-testid="spike-data-detail"></pre>
      <h3>Analytics</h3>
      <pre data-testid="spike-data-analytics"></pre>
    `;
    const $ = (id: string) => target!.querySelector<HTMLElement>(`[data-testid=spike-data-${id}]`)!;
    const bus = runtime.bus;

    if (bus) {
      let first: VehiclePositionsTick | undefined;
      this.stops.push(
        bus.on<VehiclePositionsTick>(TOPIC_VEHICLE_POSITIONS, (tick, meta) => {
          first ??= tick;
          const moving = tick.vehicles.filter((v) => v.shipment_id !== null);
          const v = moving[0];
          const elapsed = ((tick.at - first.at) / 1000).toFixed(1);
          $("positions").textContent =
            `tick ${tick.tick} from ${meta.source}, ${tick.vehicles.length} vehicles, ${moving.length} moving\n` +
            `${tick.tick - first.tick} ticks in ${elapsed}s since the first one seen\n` +
            (v ? `vehicle ${v.id} (shipment ${v.shipment_id}): ${v.lat}, ${v.lon}` : "");
        }),
      );
    } else {
      $("positions").textContent = "no bus on this kernel";
    }

    const runQueries = async () => {
      const base: ServerSideRowsRequest = {
        startRow: 0,
        endRow: 5,
        rowGroupCols: [LANE, CARRIER],
        groupKeys: [],
        valueCols: SUMS,
        sortModel: [{ colId: "rate_usd", sort: "desc" }],
      };
      const [lanes, laneMs] = await timed(() => fynopsData.shipments.rows(base));
      const firstLane = lanes.rowData[0]?.lane as string;
      const [carriers, carrierMs] = await timed(() =>
        fynopsData.shipments.rows({ ...base, groupKeys: [firstLane] }),
      );
      $("groups").textContent =
        `lanes: ${laneMs} ms, ${lanes.rowCount} lanes, top 5 by revenue\n` +
        lanes.rowData
          .map((r) => `  ${r.lane}: ${r.childCount} shipments, $${Math.round(r.rate_usd as number)}`)
          .join("\n") +
        `\ncarriers under ${firstLane}: ${carrierMs} ms, ${carriers.rowCount} carriers\n` +
        carriers.rowData
          .map((r) => `  ${r.carrier}: ${r.childCount} shipments, avg ${Math.round(r.weight_lbs as number)} lbs`)
          .join("\n");

      const [leaves, leafMs] = await timed(() =>
        fynopsData.shipments.rows({
          startRow: 0,
          endRow: 5,
          rowGroupCols: [],
          groupKeys: [],
          valueCols: [],
          sortModel: [{ colId: "weight_lbs", sort: "desc" }],
          filterModel: {
            status: { filterType: "set", values: ["delayed"] },
            weight_lbs: { filterType: "number", type: "greaterThan", filter: 20000 },
          },
        }),
      );
      $("leaves").textContent =
        `${leafMs} ms, ${leaves.rowCount} matching\n` +
        leaves.rowData
          .map((r) => `  ${r.ref} ${r.lane} ${r.carrier} ${r.weight_lbs} lbs ${r.status}`)
          .join("\n");

      const withVehicle = leaves.rowData.find((r) => r.vehicle_id !== null) ?? leaves.rowData[0];
      if (bus && withVehicle) {
        const [detail, detailMs] = await timed(() =>
          bus.request<ShipmentDetail | null, ShipmentGetRequest>(TOPIC_SHIPMENT_GET, { id: withVehicle.id as number }),
        );
        $("detail").textContent = detail
          ? `${detailMs} ms via the bus\n${detail.ref} ${detail.origin_info.city} -> ${detail.destination_info.city}` +
            ` (${detail.miles} mi), ${detail.carrier} ${detail.carrier_dot}\n` +
            `vehicle: ${detail.vehicle ? `${detail.vehicle.plate} ${detail.vehicle.status} at ${detail.vehicle.lat}, ${detail.vehicle.lon}, carrying shipment ${detail.vehicle.shipment_id}` : "none"}`
          : "not found";
      }

      const [[onTime, laneCost, trend, positions], analyticsMs] = await timed(() =>
        Promise.all([
          fynopsData.analytics.onTime("carrier"),
          fynopsData.analytics.laneCost({ limit: 3 }),
          fynopsData.analytics.trend(7),
          fynopsData.vehicles.positions(),
        ]),
      );
      $("analytics").textContent =
        `all four calls: ${analyticsMs} ms\n` +
        `onTime(carrier): ${onTime.length} rows, best ${onTime[0]?.key} at ${Math.round(onTime[0]?.on_time_rate * 100)}%\n` +
        `laneCost: ${laneCost.map((l) => `${l.lane} ${l.shipments} shipments $${l.cost_per_mile}/mi`).join(", ")}\n` +
        `trend(7): ${trend.map((d) => `${d.day.slice(5)} ${d.shipments}`).join(", ")}\n` +
        `vehicles.positions(): ${positions.length} vehicles`;
    };

    const showStatus = (s: DataStatus) => {
      $("status").textContent = JSON.stringify(s, null, 2);
    };

    const load = async () => {
      const status = await fynopsData.status();
      showStatus(status);
      if (status.state === "ready") await runQueries();
    };

    target.querySelector("[data-action=reset]")!.addEventListener("click", async () => {
      $("status").textContent = "resetting...";
      showStatus(await fynopsData.reset());
      await runQueries();
    });
    target.querySelector("[data-action=rerun]")!.addEventListener("click", () => void runQueries());

    load().catch((error) => {
      $("status").textContent = `failed: ${error.message}`;
    });

    return {
      type: "self-managed" as const,
      target,
      metadata: { framework: "vanilla", capabilities: ["self-managed"] },
    };
  }

  shutdown(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }
}

export const main = new SpikeData();
