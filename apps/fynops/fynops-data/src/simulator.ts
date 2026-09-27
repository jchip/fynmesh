/**
 * Moves vehicles along their lanes, one tick per second.
 *
 * A vehicle carrying an active shipment (picked up, in transit or delayed)
 * shuttles between that lane's origin and destination warehouses. The other
 * vehicles stay put. Progress is not stored: on start, each vehicle's stored
 * position is projected onto its lane, so a reload resumes where it left off.
 *
 * A vehicle that reaches either warehouse is `loading` for a few ticks before it
 * heads out again, and a fixed few are in `maintenance`, so the status mix moves.
 */
import type sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { VehiclePosition, VehiclePositionsTick } from "fynops-data-core";

type DB = InstanceType<Awaited<ReturnType<typeof sqlite3InitModule>>["oo1"]["DB"]>;

/** About two minutes to cross an average lane. */
const MILES_PER_TICK = 8;
/** Delayed shipments crawl. */
const DELAYED_FACTOR = 0.5;
/** Ticks a vehicle spends loading at a warehouse. */
const LOADING_TICKS = 12;
/** Every Nth vehicle is parked for maintenance. */
const MAINTENANCE_EVERY = 40;

interface Leg {
  shipmentId: number;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  miles: number;
  delayed: boolean;
  /** 0 at origin, 1 at destination */
  progress: number;
  forward: boolean;
  /** Ticks left at a warehouse; 0 while driving. */
  dwell: number;
}

interface SimVehicle extends VehiclePosition {
  leg?: Leg;
}

function project(lat: number, lon: number, leg: Omit<Leg, "progress" | "forward" | "dwell">): number {
  const dx = leg.toLon - leg.fromLon;
  const dy = leg.toLat - leg.fromLat;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  const t = ((lon - leg.fromLon) * dx + (lat - leg.fromLat) * dy) / len2;
  return Math.min(1, Math.max(0, t));
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export class Simulator {
  private vehicles: SimVehicle[];
  private tickNo = 0;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private db: DB) {
    const rows = db.exec({
      sql: "SELECT id, carrier_id, status, lat, lon FROM vehicles ORDER BY id",
      rowMode: "object",
      returnValue: "resultRows",
    }) as Array<{ id: number; carrier_id: number; status: string; lat: number; lon: number }>;
    // SQLite returns the other columns from the row that holds min(s.id).
    const legs = db.exec({
      sql:
        "SELECT s.vehicle_id AS vehicle_id, min(s.id) AS shipment_id, s.status AS status, l.miles AS miles," +
        " o.lat AS o_lat, o.lon AS o_lon, d.lat AS d_lat, d.lon AS d_lon" +
        " FROM shipments s JOIN lanes l ON l.id = s.lane_id" +
        " JOIN warehouses o ON o.id = l.origin_id JOIN warehouses d ON d.id = l.destination_id" +
        " WHERE s.vehicle_id IS NOT NULL AND s.status IN ('picked_up', 'in_transit', 'delayed')" +
        " GROUP BY s.vehicle_id",
      rowMode: "object",
      returnValue: "resultRows",
    }) as Array<{
      vehicle_id: number;
      shipment_id: number;
      status: string;
      miles: number;
      o_lat: number;
      o_lon: number;
      d_lat: number;
      d_lon: number;
    }>;
    const legByVehicle = new Map(legs.map((l) => [l.vehicle_id, l]));

    this.vehicles = rows.map((v) => {
      const l = legByVehicle.get(v.id);
      const vehicle: SimVehicle = { ...v, shipment_id: null };
      if (l) {
        const base = {
          shipmentId: l.shipment_id,
          fromLat: l.o_lat,
          fromLon: l.o_lon,
          toLat: l.d_lat,
          toLon: l.d_lon,
          miles: Math.max(1, l.miles),
          delayed: l.status === "delayed",
        };
        // Odd ids start out heading home, so the map is not all one-way traffic.
        // Staggered start: some vehicles begin mid-load, so loading is never empty.
        const dwell = v.id % 7 === 0 ? (v.id % LOADING_TICKS) + 1 : 0;
        vehicle.leg = { ...base, progress: project(v.lat, v.lon, base), forward: v.id % 2 === 0, dwell };
        vehicle.shipment_id = l.shipment_id;
        vehicle.status =
          v.id % MAINTENANCE_EVERY === 0 ? "maintenance" : dwell > 0 ? "loading" : "en_route";
      }
      return vehicle;
    });
  }

  /** Every vehicle's current position, without the internal leg state. */
  snapshot(): VehiclePosition[] {
    return this.vehicles.map(({ id, lat, lon, status, carrier_id, shipment_id }) => ({
      id,
      lat,
      lon,
      status,
      carrier_id,
      shipment_id,
    }));
  }

  /** Advance one tick, store the moved positions, and return the tick. */
  step(): VehiclePositionsTick {
    const moved: SimVehicle[] = [];
    for (const v of this.vehicles) {
      const leg = v.leg;
      if (!leg || v.status === "maintenance") continue;
      if (leg.dwell > 0) {
        leg.dwell -= 1;
        if (leg.dwell === 0) {
          v.status = "en_route";
          moved.push(v);
        }
        continue;
      }
      const delta = (MILES_PER_TICK * (leg.delayed ? DELAYED_FACTOR : 1)) / leg.miles;
      let p = leg.progress + (leg.forward ? delta : -delta);
      if (p >= 1 || p <= 0) {
        p = p >= 1 ? 1 : 0;
        leg.forward = p === 0;
        leg.dwell = LOADING_TICKS;
        v.status = "loading";
      }
      leg.progress = p;
      v.lat = round5(leg.fromLat + (leg.toLat - leg.fromLat) * p);
      v.lon = round5(leg.fromLon + (leg.toLon - leg.fromLon) * p);
      moved.push(v);
    }
    if (moved.length) {
      const stmt = this.db.prepare("UPDATE vehicles SET lat = ?, lon = ?, status = ? WHERE id = ?");
      try {
        this.db.transaction(() => {
          for (const v of moved) stmt.bind([v.lat, v.lon, v.status, v.id] as any).stepReset();
        });
      } finally {
        stmt.finalize();
      }
    }
    this.tickNo += 1;
    return { tick: this.tickNo, at: Date.now(), vehicles: this.snapshot() };
  }

  start(onTick: (tick: VehiclePositionsTick) => void, intervalMs = 1000): void {
    this.stop();
    this.timer = setInterval(() => onTick(this.step()), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
