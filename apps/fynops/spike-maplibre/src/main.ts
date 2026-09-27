import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// @ts-ignore - virtual module from rollup.config.ts
import workerUrl from "maplibre-worker-url";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const VEHICLES = 2000;
// Continental US bounding box
const WEST = -124, EAST = -67, SOUTH = 25, NORTH = 49;

interface Vehicle {
  lon: number;
  lat: number;
  heading: number;
}

function makeVehicles(): Vehicle[] {
  let seed = 42;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: VEHICLES }, () => ({
    lon: WEST + rand() * (EAST - WEST),
    lat: SOUTH + rand() * (NORTH - SOUTH),
    heading: rand() * Math.PI * 2,
  }));
}

function toGeoJSON(vehicles: Vehicle[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: vehicles.map((v, i) => ({
      type: "Feature",
      id: i,
      properties: {},
      geometry: { type: "Point", coordinates: [v.lon, v.lat] },
    })),
  };
}

function step(vehicles: Vehicle[]): void {
  for (const v of vehicles) {
    v.heading += (Math.random() - 0.5) * 0.3;
    v.lon += Math.cos(v.heading) * 0.05;
    v.lat += Math.sin(v.heading) * 0.05;
    if (v.lon < WEST || v.lon > EAST) v.heading = Math.PI - v.heading;
    if (v.lat < SOUTH || v.lat > NORTH) v.heading = -v.heading;
  }
}

/**
 * Phase 0 spike: maplibre-gl with its module worker served from this
 * FynApp's dist, public OpenFreeMap tiles, and 2,000 points moving at 1Hz.
 */
class SpikeMaplibre implements FynUnit {
  private map?: maplibregl.Map;
  private timer?: ReturnType<typeof setInterval>;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(_runtime: FynUnitRuntime) {
    maplibregl.setWorkerUrl(workerUrl);

    const target = document.createElement("div");
    target.id = "spike-maplibre";
    target.innerHTML = `
      <div data-testid="map-stats" style="font:13px system-ui;padding:4px 8px">starting</div>
      <div class="map" style="width:100%;height:70vh"></div>`;
    document.body.appendChild(target);
    const stats = target.querySelector<HTMLElement>("[data-testid=map-stats]")!;

    const map = new maplibregl.Map({
      container: target.querySelector<HTMLElement>(".map")!,
      style: STYLE_URL,
      center: [-96, 38],
      zoom: 3.3,
    });
    map.addControl(new maplibregl.NavigationControl());
    this.map = map;

    const vehicles = makeVehicles();
    let ticks = 0;
    let totalMs = 0;
    let maxMs = 0;

    map.on("load", () => {
      map.addSource("vehicles", { type: "geojson", data: toGeoJSON(vehicles) });
      map.addLayer({
        id: "vehicles",
        type: "circle",
        source: "vehicles",
        paint: { "circle-radius": 3, "circle-color": "#e4572e", "circle-stroke-width": 0.5 },
      });

      const source = map.getSource("vehicles") as maplibregl.GeoJSONSource;
      this.timer = setInterval(() => {
        const t0 = performance.now();
        step(vehicles);
        source.setData(toGeoJSON(vehicles));
        const ms = performance.now() - t0;
        ticks++;
        totalMs += ms;
        maxMs = Math.max(maxMs, ms);
        stats.textContent =
          `loaded ticks=${ticks} vehicles=${VEHICLES} ` +
          `step+setData avg=${(totalMs / ticks).toFixed(2)}ms max=${maxMs.toFixed(2)}ms ` +
          `worker=${workerUrl}`;
      }, 1000);
    });
    map.on("error", (e) => console.error("[spike-maplibre] map error", e.error));

    return {
      type: "self-managed" as const,
      target,
      cleanup: () => this.shutdown(),
      metadata: { framework: "vanilla", capabilities: ["self-managed"] },
    };
  }

  shutdown(): void {
    clearInterval(this.timer);
    this.map?.remove();
    this.map = undefined;
  }
}

export const main = new SpikeMaplibre();
