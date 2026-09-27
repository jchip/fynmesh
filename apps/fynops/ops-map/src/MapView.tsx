import React, { useEffect, useRef, useState } from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import type { FynOpsShellApi, FynOpsViewProps, Selection } from "fynops-shell/api";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// @ts-ignore - virtual module from rollup.config.ts
import workerUrl from "maplibre-worker-url";
import {
  fynopsData,
  TOPIC_VEHICLE_POSITIONS,
  type VehiclePosition,
  type VehiclePositionsTick,
} from "fynops-data-core";
import { Panel } from "fynops-ui-kit";
import {
  VEHICLE_COLOR_EXPRESSION,
  VEHICLE_STATUSES,
  vehiclesToGeoJSON,
  warehousesToGeoJSON,
  type WarehouseInfo,
} from "./map-data";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const US_CENTER: [number, number] = [-96, 38];

interface Props {
  shell: FynOpsShellApi;
  props: FynOpsViewProps;
  runtime: FynUnitRuntime;
}

/**
 * The FynOps fleet map: warehouses (labeled symbol layer) and vehicles (circle
 * layer colored by status) on a maplibre map. First paint comes from
 * fynopsData.vehicles.positions(), then a bus subscription keeps it moving.
 * The shell's selection pans and highlights the matching vehicle; clicking a
 * vehicle sets the selection back and opens its shipment in the drawer.
 */
const MapView: React.FC<Props> = ({ shell, runtime }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [error, setError] = useState<string>();

  useEffect(() => {
    const stops: Array<() => void> = [];
    let cancelled = false;

    maplibregl.setWorkerUrl(workerUrl);
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE_URL,
      center: US_CENTER,
      zoom: 3.3,
    });
    map.addControl(new maplibregl.NavigationControl());
    map.on("error", (e) => console.error("[ops-map] map error", e.error));

    // Resize the map when its element becomes visible again: the shell hides
    // routes it isn't showing with `display: none` instead of unmounting
    // them, so maplibre's cached canvas size goes stale until told otherwise.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current!);
    stops.push(() => resizeObserver.disconnect());

    const vehiclesById = new Map<number, VehiclePosition>();
    let selectedVehicleId: number | undefined;
    let lastSelection: Selection | undefined;

    const highlight = (vehicleId: number) => {
      if (selectedVehicleId != null && selectedVehicleId !== vehicleId) {
        map.setFeatureState({ source: "vehicles", id: selectedVehicleId }, { selected: false });
      }
      selectedVehicleId = vehicleId;
      map.setFeatureState({ source: "vehicles", id: vehicleId }, { selected: true });
    };

    const flyToVehicle = (v: { id: number; lat: number; lon: number }) => {
      highlight(v.id);
      map.flyTo({ center: [v.lon, v.lat], zoom: Math.max(map.getZoom(), 6) });
    };

    map.on("load", () => {
      if (cancelled) return;

      Promise.all([
        fynopsData.vehicles.positions(),
        fynopsData.query<WarehouseInfo>("SELECT code, city, state, lat, lon FROM warehouses"),
      ])
        .then(([vehicles, warehouses]) => {
          if (cancelled) return;
          for (const v of vehicles) vehiclesById.set(v.id, v);

          map.addSource("warehouses", { type: "geojson", data: warehousesToGeoJSON(warehouses) });
          map.addLayer({
            id: "warehouses-dot",
            type: "circle",
            source: "warehouses",
            paint: {
              "circle-radius": 5,
              "circle-color": "#0f172a",
              "circle-stroke-width": 1,
              "circle-stroke-color": "#ffffff",
            },
          });
          map.addLayer({
            id: "warehouses-label",
            type: "symbol",
            source: "warehouses",
            layout: {
              "text-field": ["get", "code"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "text-offset": [0, 1.1],
              "text-anchor": "top",
            },
            paint: {
              "text-color": "#0f172a",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.2,
            },
          });

          map.addSource("vehicles", { type: "geojson", data: vehiclesToGeoJSON(vehicles) });
          map.addLayer({
            id: "vehicles-layer",
            type: "circle",
            source: "vehicles",
            paint: {
              "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 9, 4],
              "circle-color": VEHICLE_COLOR_EXPRESSION as any,
              "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, 0],
              "circle-stroke-color": "#111827",
            },
          });

          map.on("mouseenter", "vehicles-layer", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "vehicles-layer", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("click", "vehicles-layer", (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            const vehicleId = Number(feature.properties?.id);
            const rawShipmentId = feature.properties?.shipment_id;
            const shipmentId = typeof rawShipmentId === "number" ? rawShipmentId : undefined;
            shell.selection.set({ vehicleId, shipmentId });
            if (shipmentId != null) shell.openDrawer("ops-shipments", { id: String(shipmentId) });
          });

          setStatus("ready");

          // Bus ticks: setData, and refresh the lookup selection uses.
          const bus = runtime.bus;
          if (bus) {
            stops.push(
              bus.on<VehiclePositionsTick>(TOPIC_VEHICLE_POSITIONS, (tick) => {
                vehiclesById.clear();
                for (const v of tick.vehicles) vehiclesById.set(v.id, v);
                const source = map.getSource("vehicles") as maplibregl.GeoJSONSource | undefined;
                source?.setData(vehiclesToGeoJSON(tick.vehicles));
              }),
            );
          }

          // Shell selection: fires immediately with the current value, then on
          // every change after. Only a changed shipmentId or vehicleId flies.
          stops.push(
            shell.selection.subscribe((selection) => {
              const shipmentChanged = selection.shipmentId !== lastSelection?.shipmentId;
              const vehicleChanged = selection.vehicleId !== lastSelection?.vehicleId;
              lastSelection = selection;

              if (selection.vehicleId != null && vehicleChanged) {
                const v = vehiclesById.get(selection.vehicleId);
                if (v) flyToVehicle(v);
                return;
              }
              if (selection.shipmentId != null && shipmentChanged) {
                fynopsData.shipments.get(selection.shipmentId).then((detail) => {
                  if (!cancelled && detail?.vehicle) flyToVehicle(detail.vehicle);
                });
              }
            }),
          );
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        });
    });

    return () => {
      cancelled = true;
      for (const stop of stops) stop();
      map.remove();
    };
    // Mounted once: `shell` and `runtime` are stable for the life of this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="om-root" style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} className="om-canvas" style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1, width: 168 }}>
        <Panel title="Vehicle status">
          {VEHICLE_STATUSES.map((s) => (
            <div
              key={s.status}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "2px 0" }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: s.color,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span>{s.label}</span>
            </div>
          ))}
        </Panel>
      </div>
      {error ? (
        <div
          className="om-error"
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <p style={{ color: "#991b1b" }}>ops-map: {error}</p>
        </div>
      ) : (
        status === "loading" && (
          <div style={{ position: "absolute", top: 12, left: 12, fontSize: 13, color: "#475569" }}>
            Loading fleet map...
          </div>
        )
      )}
    </div>
  );
};

export default MapView;
