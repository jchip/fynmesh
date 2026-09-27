/**
 * Seeded FynOps dataset generator.
 *
 * Pure TS with erasable syntax only, so the browser worker bundles it and the
 * Node prime script runs it directly with Node's type stripping. Same seed and
 * scale give the same rows in both.
 *
 * Rows are emitted as arrays in the column order of the matching table in
 * schema.ts, which keeps inserts to one prepared statement per table.
 */

export type Scale = "small" | "medium" | "large";

export const SCALES: Record<Scale, { shipments: number; vehicles: number }> = {
  small: { shipments: 10_000, vehicles: 500 },
  medium: { shipments: 100_000, vehicles: 2_000 },
  large: { shipments: 1_000_000, vehicles: 5_000 },
};

export interface GenerateOptions {
  seed: number;
  scale: Scale;
}

/** mulberry32: small, fast, good enough for demo data. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CARRIERS = [
  "Blue Ridge Freight", "Prairie Line", "Coastal Haulers", "Summit Logistics",
  "Red River Transport", "Great Lakes Cartage", "Desert Sun Express", "Northstar Carriers",
  "Ironhorse Trucking", "Gulf Stream Freight", "Cascade Movers", "Heartland Haul",
  "Pioneer Road Lines", "Evergreen Transit", "Magnolia Freight", "Big Sky Logistics",
  "Keystone Carriers", "Silver State Trucking", "Bayou Express", "Granite Peak Freight",
];

/** [code, city, state, lat, lon] */
const WAREHOUSES: Array<[string, string, string, number, number]> = [
  ["ATL", "Atlanta", "GA", 33.749, -84.388], ["AUS", "Austin", "TX", 30.267, -97.743],
  ["BAL", "Baltimore", "MD", 39.29, -76.612], ["BHM", "Birmingham", "AL", 33.519, -86.81],
  ["BOS", "Boston", "MA", 42.36, -71.059], ["BUF", "Buffalo", "NY", 42.886, -78.878],
  ["CHI", "Chicago", "IL", 41.878, -87.63], ["CLT", "Charlotte", "NC", 35.227, -80.843],
  ["CLE", "Cleveland", "OH", 41.499, -81.694], ["CMH", "Columbus", "OH", 39.961, -82.999],
  ["DAL", "Dallas", "TX", 32.777, -96.797], ["DEN", "Denver", "CO", 39.739, -104.99],
  ["DET", "Detroit", "MI", 42.331, -83.046], ["ELP", "El Paso", "TX", 31.762, -106.485],
  ["HOU", "Houston", "TX", 29.76, -95.37], ["IND", "Indianapolis", "IN", 39.768, -86.158],
  ["JAX", "Jacksonville", "FL", 30.332, -81.656], ["KCM", "Kansas City", "MO", 39.1, -94.579],
  ["LAS", "Las Vegas", "NV", 36.17, -115.14], ["LAX", "Los Angeles", "CA", 34.052, -118.244],
  ["MEM", "Memphis", "TN", 35.15, -90.049], ["MIA", "Miami", "FL", 25.762, -80.192],
  ["MKE", "Milwaukee", "WI", 43.039, -87.906], ["MSP", "Minneapolis", "MN", 44.978, -93.265],
  ["BNA", "Nashville", "TN", 36.163, -86.781], ["MSY", "New Orleans", "LA", 29.951, -90.072],
  ["NYC", "New York", "NY", 40.713, -74.006], ["OKC", "Oklahoma City", "OK", 35.468, -97.516],
  ["OMA", "Omaha", "NE", 41.257, -95.935], ["PHL", "Philadelphia", "PA", 39.953, -75.165],
  ["PHX", "Phoenix", "AZ", 33.448, -112.074], ["PIT", "Pittsburgh", "PA", 40.441, -79.996],
  ["PDX", "Portland", "OR", 45.505, -122.675], ["RNO", "Reno", "NV", 39.53, -119.814],
  ["SLC", "Salt Lake City", "UT", 40.761, -111.891], ["SAT", "San Antonio", "TX", 29.424, -98.494],
  ["SAN", "San Diego", "CA", 32.716, -117.161], ["SFO", "San Francisco", "CA", 37.775, -122.419],
  ["SEA", "Seattle", "WA", 47.606, -122.332], ["STL", "St. Louis", "MO", 38.627, -90.199],
];

const SHIPMENT_STATUSES = ["booked", "picked_up", "in_transit", "delayed", "delivered", "exception"];
const STATUS_WEIGHTS = [0.1, 0.08, 0.3, 0.07, 0.42, 0.03];
const VEHICLE_STATUSES = ["idle", "en_route", "loading", "maintenance"];

/** All timestamps are offsets from here, so output never depends on today. */
const EPOCH_MS = Date.UTC(2026, 8, 1);
const HOUR_MS = 3_600_000;

function milesBetween(a: [string, string, string, number, number], b: typeof a): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[3] - a[3]);
  const dLon = toRad(b[4] - a[4]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[3])) * Math.cos(toRad(b[3])) * Math.sin(dLon / 2) ** 2;
  return Math.round(3959 * 2 * Math.asin(Math.sqrt(h)));
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19) + "Z";
}

export interface Dataset {
  carriers(): Iterable<unknown[]>;
  warehouses(): Iterable<unknown[]>;
  lanes(): Iterable<unknown[]>;
  vehicles(): Iterable<unknown[]>;
  shipments(): Iterable<unknown[]>;
}

/**
 * The dataset as lazy row iterators, one per table, meant to be consumed in
 * the order listed. Each table draws from its own PRNG stream, so adding rows
 * to one table never reshuffles another.
 */
export function generate({ seed, scale }: GenerateOptions): Dataset {
  const size = SCALES[scale];
  const laneCount = 300;
  const lanePairs: Array<[number, number, number]> = [];
  {
    const rand = prng(seed ^ 0x1a2b);
    while (lanePairs.length < laneCount) {
      const o = Math.floor(rand() * WAREHOUSES.length);
      const d = Math.floor(rand() * WAREHOUSES.length);
      if (o === d) continue;
      lanePairs.push([o + 1, d + 1, milesBetween(WAREHOUSES[o], WAREHOUSES[d])]);
    }
  }

  return {
    *carriers() {
      for (let i = 0; i < CARRIERS.length; i++) {
        yield [i + 1, CARRIERS[i], `DOT${1_000_000 + i * 7919}`];
      }
    },
    *warehouses() {
      for (let i = 0; i < WAREHOUSES.length; i++) {
        const [code, city, state, lat, lon] = WAREHOUSES[i];
        yield [i + 1, code, city, state, lat, lon];
      }
    },
    *lanes() {
      for (let i = 0; i < lanePairs.length; i++) {
        const [o, d, miles] = lanePairs[i];
        yield [i + 1, o, d, miles];
      }
    },
    *vehicles() {
      const rand = prng(seed ^ 0x3c4d);
      for (let i = 0; i < size.vehicles; i++) {
        const home = WAREHOUSES[Math.floor(rand() * WAREHOUSES.length)];
        yield [
          i + 1,
          1 + Math.floor(rand() * CARRIERS.length),
          `TRK-${(10_000 + i).toString(36).toUpperCase()}`,
          VEHICLE_STATUSES[Math.floor(rand() * VEHICLE_STATUSES.length)],
          +(home[3] + (rand() - 0.5) * 2).toFixed(5),
          +(home[4] + (rand() - 0.5) * 2).toFixed(5),
        ];
      }
    },
    *shipments() {
      const rand = prng(seed ^ 0x5e6f);
      const pickStatus = () => {
        let r = rand();
        for (let s = 0; s < STATUS_WEIGHTS.length; s++) {
          r -= STATUS_WEIGHTS[s];
          if (r <= 0) return SHIPMENT_STATUSES[s];
        }
        return SHIPMENT_STATUSES[0];
      };
      for (let i = 0; i < size.shipments; i++) {
        const laneId = 1 + Math.floor(rand() * lanePairs.length);
        const miles = lanePairs[laneId - 1][2];
        const status = pickStatus();
        const pickup = EPOCH_MS + Math.floor(rand() * 60 * 24) * HOUR_MS;
        const transitHours = Math.ceil(miles / 50) + 4;
        const due = pickup + transitHours * HOUR_MS;
        const delivered =
          status === "delivered" ? due + Math.round((rand() - 0.7) * 12) * HOUR_MS : null;
        const weight = 500 + Math.floor(rand() * 44_500);
        yield [
          i + 1,
          `SHP-${(1_000_000 + i).toString()}`,
          status,
          1 + Math.floor(rand() * CARRIERS.length),
          laneId,
          status === "delivered" || status === "booked" ? null : 1 + Math.floor(rand() * size.vehicles),
          weight,
          1 + Math.floor(rand() * 26),
          Math.round(miles * (1.6 + rand() * 1.4) * (1 + weight / 90_000) * 100) / 100,
          iso(pickup),
          iso(due),
          delivered === null ? null : iso(delivered),
        ];
      }
    },
  };
}
