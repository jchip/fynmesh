/**
 * FynOps schema and the one seeding routine both runtimes share.
 *
 * The browser worker (sqlite wasm) and the Node prime script (node:sqlite) each
 * wrap their own driver in a {@link SeedTarget}; everything else is here, so
 * the two cannot build different databases.
 */
import { generate, SCALES, type Dataset, type Scale } from "./generator.ts";

/** Bump when the tables change. A stored database with another value is dropped. */
export const SCHEMA_VERSION = 1;
/** Bump when the generator's output changes for the same seed. */
export const SEED_VERSION = 2;
export const DEFAULT_SEED = 20260901;
/** 10k shipments: seeds in the browser in about 100ms, so no seed file is needed. */
export const DEFAULT_SCALE: Scale = "small";

export interface TableDef {
  name: keyof Dataset;
  columns: string[];
  ddl: string;
}

export const TABLES: TableDef[] = [
  {
    name: "carriers",
    columns: ["id", "name", "dot_number"],
    ddl: "CREATE TABLE carriers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, dot_number TEXT NOT NULL)",
  },
  {
    name: "warehouses",
    columns: ["id", "code", "city", "state", "lat", "lon"],
    ddl:
      "CREATE TABLE warehouses (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, city TEXT NOT NULL," +
      " state TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL)",
  },
  {
    name: "lanes",
    columns: ["id", "origin_id", "destination_id", "miles"],
    ddl:
      "CREATE TABLE lanes (id INTEGER PRIMARY KEY, origin_id INTEGER NOT NULL REFERENCES warehouses(id)," +
      " destination_id INTEGER NOT NULL REFERENCES warehouses(id), miles INTEGER NOT NULL)",
  },
  {
    name: "vehicles",
    columns: ["id", "carrier_id", "plate", "status", "lat", "lon"],
    ddl:
      "CREATE TABLE vehicles (id INTEGER PRIMARY KEY, carrier_id INTEGER NOT NULL REFERENCES carriers(id)," +
      " plate TEXT NOT NULL, status TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL)",
  },
  {
    name: "shipments",
    columns: [
      "id", "ref", "status", "carrier_id", "lane_id", "vehicle_id", "weight_lbs", "pieces",
      "rate_usd", "pickup_at", "due_at", "delivered_at",
    ],
    ddl:
      "CREATE TABLE shipments (id INTEGER PRIMARY KEY, ref TEXT NOT NULL, status TEXT NOT NULL," +
      " carrier_id INTEGER NOT NULL REFERENCES carriers(id), lane_id INTEGER NOT NULL REFERENCES lanes(id)," +
      " vehicle_id INTEGER REFERENCES vehicles(id), weight_lbs INTEGER NOT NULL, pieces INTEGER NOT NULL," +
      " rate_usd REAL NOT NULL, pickup_at TEXT NOT NULL, due_at TEXT NOT NULL, delivered_at TEXT)",
  },
];

const INDEXES = [
  "CREATE INDEX shipments_status ON shipments(status)",
  "CREATE INDEX shipments_carrier ON shipments(carrier_id)",
  "CREATE INDEX shipments_lane ON shipments(lane_id)",
  "CREATE INDEX shipments_due ON shipments(due_at)",
];

export interface SeedTarget {
  exec(sql: string): void;
  /** Insert rows with one prepared statement. Runs inside the seed transaction. */
  insertRows(table: TableDef, sql: string, rows: Iterable<unknown[]>): void;
}

export interface SeedOptions {
  seed?: number;
  scale?: Scale;
}

export function insertSql(table: TableDef): string {
  return `INSERT INTO ${table.name} (${table.columns.join(", ")}) VALUES (${table.columns.map(() => "?").join(", ")})`;
}

/** Create every table, fill it, index it and stamp `meta`, in one transaction. */
export function seedDatabase(target: SeedTarget, { seed = DEFAULT_SEED, scale = DEFAULT_SCALE }: SeedOptions = {}): void {
  const data = generate({ seed, scale });
  target.exec("BEGIN");
  try {
    target.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    for (const table of TABLES) {
      target.exec(table.ddl);
      target.insertRows(table, insertSql(table), data[table.name]());
    }
    for (const sql of INDEXES) target.exec(sql);
    const meta: Record<string, string | number> = {
      schema_version: SCHEMA_VERSION,
      seed_version: SEED_VERSION,
      seed,
      scale,
      shipments: SCALES[scale].shipments,
    };
    for (const [key, value] of Object.entries(meta)) {
      target.exec(`INSERT INTO meta (key, value) VALUES ('${key}', '${value}')`);
    }
    target.exec("COMMIT");
  } catch (error) {
    target.exec("ROLLBACK");
    throw error;
  }
}
