import type { VehiclePosition } from "fynops-data-core";

/** Matches fynops-data's `warehouses` table columns (minus `id`). */
export interface WarehouseInfo {
  code: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export interface VehicleStatusInfo {
  status: string;
  label: string;
  color: string;
}

/** Vehicle statuses fynops-data generates (see generator.ts VEHICLE_STATUSES). */
export const VEHICLE_STATUSES: VehicleStatusInfo[] = [
  { status: "en_route", label: "En route", color: "#2563eb" },
  { status: "idle", label: "Idle", color: "#94a3b8" },
  { status: "loading", label: "Loading", color: "#f59e0b" },
  { status: "maintenance", label: "Maintenance", color: "#dc2626" },
];

const DEFAULT_VEHICLE_COLOR = "#6b7280";

/** `circle-color` match expression, kept in step with VEHICLE_STATUSES above. */
export const VEHICLE_COLOR_EXPRESSION: any[] = [
  "match",
  ["get", "status"],
  ...VEHICLE_STATUSES.flatMap((s) => [s.status, s.color]),
  DEFAULT_VEHICLE_COLOR,
];

export function vehiclesToGeoJSON(vehicles: VehiclePosition[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: vehicles.map((v) => ({
      type: "Feature",
      id: v.id,
      properties: {
        id: v.id,
        status: v.status,
        shipment_id: v.shipment_id,
        carrier_id: v.carrier_id,
      },
      geometry: { type: "Point", coordinates: [v.lon, v.lat] },
    })),
  };
}

export function warehousesToGeoJSON(warehouses: WarehouseInfo[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: warehouses.map((w, index) => ({
      type: "Feature",
      id: index,
      properties: { code: w.code, city: w.city, state: w.state },
      geometry: { type: "Point", coordinates: [w.lon, w.lat] },
    })),
  };
}
