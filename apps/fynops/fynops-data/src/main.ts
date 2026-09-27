import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import {
  fynopsData,
  TOPIC_SHIPMENT_GET,
  TOPIC_VEHICLE_POSITIONS,
  type ShipmentDetail,
  type ShipmentGetRequest,
  type VehiclePositionsTick,
} from "fynops-data-core";

/**
 * fynops-data's own unit. It starts the database worker as soon as the provider
 * loads, re-emits the simulator's ticks on the bus, and answers shipment
 * lookups over the bus. Emitting from here stamps fynops-data as the source.
 */
class FynOpsDataUnit implements FynUnit {
  private stops: Array<() => void> = [];

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "provider" as const };
  }

  async execute(runtime: FynUnitRuntime) {
    const bus = runtime.bus;
    if (bus) {
      this.stops.push(
        fynopsData.simulator.onTick((tick) => bus.emit<VehiclePositionsTick>(TOPIC_VEHICLE_POSITIONS, tick)),
        bus.handle<ShipmentGetRequest, ShipmentDetail | null>(TOPIC_SHIPMENT_GET, ({ id }) =>
          fynopsData.shipments.get(id),
        ),
      );
    } else {
      console.warn("[fynops-data] no bus on this kernel; positions will not be published");
    }
    // Start the worker now, so the simulator runs before any feature asks for data.
    void fynopsData.status();
    return { type: "no-render" as const };
  }

  shutdown(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }
}

export const main = new FynOpsDataUnit();
