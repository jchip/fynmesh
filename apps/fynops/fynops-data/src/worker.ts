/**
 * The FynOps database worker: SQLite wasm on OPFS through the `opfs-sahpool`
 * VFS, which needs no COOP/COEP headers.
 *
 * Startup, in order:
 * 1. Take a Web Lock. sahpool holds exclusive OPFS handles, so a second tab
 *    would fail or corrupt data; it reports "locked" instead.
 * 2. Open the stored database. If its meta versions match the code, use it.
 * 3. Otherwise import `fynops-seed.json`'s file from next to this worker, if
 *    the published site shipped one.
 * 4. Otherwise generate the data here.
 * If OPFS is unavailable, the database lives in memory and is generated.
 *
 * Once ready, the simulator moves vehicles once per second and posts each tick
 * as a `positions` event. Only the tab that holds the lock gets this far, so
 * only one tab runs the simulator.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type {
  DataSource,
  DataStatus,
  LaneCostRow,
  OnTimeBy,
  OnTimeRow,
  Page,
  ServerSideRowsRequest,
  ServerSideRowsResult,
  ShipmentDetail,
  ShipmentPageOptions,
  ShipmentRow,
  TrendRow,
  WorkerEvent,
  WorkerRequest,
  WorkerResponse,
} from "fynops-data-core";
import {
  LANE_COST_SQL,
  SHIPMENT_GET_SQL,
  TREND_SQL,
  laneCostLimit,
  onTimeSql,
  trendParams,
} from "./queries.ts";
import { buildShipmentRowsQuery } from "./rows-query.ts";
import { SCHEMA_VERSION, SEED_VERSION, TABLES, seedDatabase } from "./schema.ts";
import { Simulator } from "./simulator.ts";

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Pool = Awaited<ReturnType<Sqlite3["installOpfsSAHPoolVfs"]>>;
type DB = InstanceType<Sqlite3["oo1"]["DB"]>;

const DB_FILE = "/fynops.sqlite3";
const LOCK_NAME = "fynops-data-db";
const SEED_MANIFEST = "fynops-seed.json";

let sqlite3: Sqlite3;
let pool: Pool | undefined;
let db: DB | undefined;
let simulator: Simulator | undefined;
let status: DataStatus = { state: "error", error: "starting" };

function startSimulator(): void {
  simulator = new Simulator(db!);
  simulator.start((tick) => self.postMessage({ event: "positions", tick } satisfies WorkerEvent));
}

function acquireLock(): Promise<boolean> {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      // Hold the lock for the life of the worker.
      return lock ? new Promise<void>(() => {}) : undefined;
    });
  });
}

function isCurrent(target: DB): boolean {
  try {
    const rows = target.exec({
      sql: "SELECT key, value FROM meta WHERE key IN ('schema_version', 'seed_version')",
      rowMode: "array",
      returnValue: "resultRows",
    }) as Array<[string, string]>;
    const meta = Object.fromEntries(rows);
    return Number(meta.schema_version) === SCHEMA_VERSION && Number(meta.seed_version) === SEED_VERSION;
  } catch {
    return false;
  }
}

function seedInto(target: DB): void {
  seedDatabase({
    exec: (sql) => void target.exec(sql),
    insertRows: (_table, sql, rows) => {
      const stmt = target.prepare(sql);
      try {
        for (const row of rows) stmt.bind(row as any).stepReset();
      } finally {
        stmt.finalize();
      }
    },
  });
}

/** The published seed file, gunzipped, or undefined when none is shipped. */
async function fetchSeedFile(): Promise<Uint8Array | undefined> {
  try {
    const res = await fetch(new URL(SEED_MANIFEST, import.meta.url));
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return undefined;
    const manifest = await res.json();
    if (manifest.schemaVersion !== SCHEMA_VERSION || manifest.seedVersion !== SEED_VERSION) {
      console.warn("[fynops-data] seed file is for another schema or seed version; generating instead");
      return undefined;
    }
    const file = await fetch(new URL(manifest.file, import.meta.url));
    if (!file.ok || !file.body) return undefined;
    const bytes = new Uint8Array(await file.arrayBuffer());
    // A server may already have decoded it (Content-Encoding: gzip).
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (error) {
    console.warn("[fynops-data] seed file unavailable:", error);
    return undefined;
  }
}

/** Fill an empty OPFS database from the seed file, else by generating. */
async function loadFresh(timings: Record<string, number>): Promise<DataSource> {
  if (!pool) throw new Error("loadFresh needs OPFS");
  let t = performance.now();
  const bytes = await fetchSeedFile();
  if (bytes) {
    timings.fetchMs = Math.round(performance.now() - t);
    t = performance.now();
    await pool.importDb(DB_FILE, bytes);
    db = new pool.OpfsSAHPoolDb(DB_FILE);
    timings.importMs = Math.round(performance.now() - t);
    if (isCurrent(db)) return "seed-file";
    db.close();
    pool.unlink(DB_FILE);
  }
  t = performance.now();
  db = new pool.OpfsSAHPoolDb(DB_FILE);
  seedInto(db);
  timings.seedMs = Math.round(performance.now() - t);
  return "generated";
}

function counts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const table of TABLES) {
    out[table.name] = Number(db!.selectValue(`SELECT count(*) FROM ${table.name}`));
  }
  return out;
}

async function open(fresh: boolean): Promise<DataStatus> {
  const start = performance.now();
  const timings: Record<string, number> = {};
  let source: DataSource;
  let storage: "opfs" | "memory";

  if (pool) {
    storage = "opfs";
    if (!fresh) {
      db = new pool.OpfsSAHPoolDb(DB_FILE);
      if (isCurrent(db)) {
        source = "existing";
      } else {
        db.close();
        pool.unlink(DB_FILE);
        source = await loadFresh(timings);
      }
    } else {
      source = await loadFresh(timings);
    }
  } else {
    storage = "memory";
    const t = performance.now();
    db = new sqlite3.oo1.DB(":memory:");
    seedInto(db);
    timings.seedMs = Math.round(performance.now() - t);
    source = "generated";
  }

  return {
    state: "ready",
    storage,
    source,
    loadMs: Math.round(performance.now() - start),
    timings,
    counts: counts(),
    schemaVersion: SCHEMA_VERSION,
    seedVersion: SEED_VERSION,
  };
}

async function start(): Promise<void> {
  const t = performance.now();
  if (!(await acquireLock())) {
    status = { state: "locked", error: "FynOps is open in another tab" };
    return;
  }
  sqlite3 = await sqlite3InitModule();
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: "fynops-sahpool" });
  } catch (error) {
    console.warn("[fynops-data] OPFS unavailable, using an in-memory database:", error);
  }
  const initMs = Math.round(performance.now() - t);
  status = await open(false);
  status.timings = { initMs, ...status.timings };
  startSimulator();
}

const SORT_SQL: Record<string, string> = {
  id: "s.id",
  ref: "s.ref",
  status: "s.status",
  carrier: "c.name",
  origin: "o.code",
  destination: "d.code",
  weight_lbs: "s.weight_lbs",
  rate_usd: "s.rate_usd",
  pickup_at: "s.pickup_at",
  due_at: "s.due_at",
};

function shipmentsPage({ offset = 0, limit = 100, sort = [], filter = {} }: ShipmentPageOptions): Page<ShipmentRow> {
  const where: string[] = [];
  const bind: unknown[] = [];
  if (filter.status) {
    where.push("s.status = ?");
    bind.push(filter.status);
  }
  if (filter.carrierId) {
    where.push("s.carrier_id = ?");
    bind.push(filter.carrierId);
  }
  if (filter.search) {
    where.push("s.ref LIKE ?");
    bind.push(`%${filter.search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = sort.length
    ? `ORDER BY ${sort
        .filter((s) => SORT_SQL[s.column])
        .map((s) => `${SORT_SQL[s.column]} ${s.dir === "desc" ? "DESC" : "ASC"}`)
        .join(", ")}`
    : "ORDER BY s.id";
  const rows = db!.exec({
    sql:
      "SELECT s.id, s.ref, s.status, s.carrier_id, c.name AS carrier, s.lane_id, o.code AS origin," +
      " d.code AS destination, s.vehicle_id, s.weight_lbs, s.pieces, s.rate_usd, s.pickup_at, s.due_at," +
      " s.delivered_at FROM shipments s JOIN carriers c ON c.id = s.carrier_id" +
      " JOIN lanes l ON l.id = s.lane_id JOIN warehouses o ON o.id = l.origin_id" +
      ` JOIN warehouses d ON d.id = l.destination_id ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    bind: [...bind, limit, offset] as any,
    rowMode: "object",
    returnValue: "resultRows",
  }) as unknown as ShipmentRow[];
  const total = Number(db!.selectValue(`SELECT count(*) FROM shipments s ${whereSql}`, bindOrUndefined(bind)));
  return { rows, total };
}

/** sqlite-wasm rejects an empty bind array on a statement with no parameters. */
function bindOrUndefined(bind: unknown[]): any {
  return bind.length ? bind : undefined;
}

function select<T>(sql: string, bind: unknown[] = []): T[] {
  return db!.exec({ sql, bind: bindOrUndefined(bind), rowMode: "object", returnValue: "resultRows" }) as unknown as T[];
}

function shipmentsRows(req: ServerSideRowsRequest): ServerSideRowsResult {
  const q = buildShipmentRowsQuery(req);
  return {
    rowData: select<Record<string, unknown>>(q.sql, q.params),
    rowCount: Number(db!.selectValue(q.countSql, bindOrUndefined(q.countParams))),
  };
}

function shipmentsGet(id: number): ShipmentDetail | null {
  const [r] = select<Record<string, any>>(SHIPMENT_GET_SQL, [id]);
  if (!r) return null;
  const pick = (prefix: string) => ({
    code: prefix === "o" ? r.origin : r.destination,
    city: r[`${prefix}_city`],
    state: r[`${prefix}_state`],
    lat: r[`${prefix}_lat`],
    lon: r[`${prefix}_lon`],
  });
  const { o_city, o_state, o_lat, o_lon, d_city, d_state, d_lat, d_lon, v_plate, v_status, v_lat, v_lon, ...row } = r;
  // The simulator holds the live position; the stored one can be a tick old.
  const live = r.vehicle_id == null ? undefined : simulator?.snapshot().find((v) => v.id === r.vehicle_id);
  return {
    ...(row as any),
    origin_info: pick("o"),
    destination_info: pick("d"),
    vehicle:
      r.vehicle_id == null
        ? null
        : {
            id: r.vehicle_id,
            plate: v_plate,
            status: live?.status ?? v_status,
            lat: live?.lat ?? v_lat,
            lon: live?.lon ?? v_lon,
            shipment_id: live?.shipment_id ?? null,
          },
  };
}

async function reset(): Promise<DataStatus> {
  if (status.state !== "ready") return status;
  simulator?.stop();
  simulator = undefined;
  db?.close();
  db = undefined;
  if (pool) pool.unlink(DB_FILE);
  status = await open(true);
  startSimulator();
  return status;
}

const ready = start().catch((error) => {
  status = { state: "error", error: String(error?.message ?? error) };
});

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, op, args } = event.data;
  const reply = (msg: Omit<WorkerResponse, "id">) => self.postMessage({ id, ...msg });
  try {
    await ready;
    if (op === "status") return reply({ ok: true, result: status });
    if (status.state !== "ready") throw new Error(status.error ?? `database ${status.state}`);
    switch (op) {
      case "query": {
        const { sql, params } = args as { sql: string; params?: unknown[] };
        return reply({
          ok: true,
          result: db!.exec({ sql, bind: bindOrUndefined(params ?? []), rowMode: "object", returnValue: "resultRows" }),
        });
      }
      case "shipmentsPage":
        return reply({ ok: true, result: shipmentsPage(args as ShipmentPageOptions) });
      case "shipmentsRows":
        return reply({ ok: true, result: shipmentsRows(args as ServerSideRowsRequest) });
      case "shipmentsGet":
        return reply({ ok: true, result: shipmentsGet(Number((args as { id: number }).id)) });
      case "vehiclePositions":
        return reply({ ok: true, result: simulator!.snapshot() });
      case "onTime":
        return reply({ ok: true, result: select<OnTimeRow>(onTimeSql((args as { by: OnTimeBy }).by)) });
      case "laneCost":
        return reply({
          ok: true,
          result: select<LaneCostRow>(LANE_COST_SQL, [laneCostLimit((args as { limit?: number })?.limit)]),
        });
      case "trend":
        return reply({ ok: true, result: select<TrendRow>(TREND_SQL, trendParams((args as { days: number }).days)) });
      case "reset":
        return reply({ ok: true, result: await reset() });
      default:
        throw new Error(`unknown op ${op}`);
    }
  } catch (error: any) {
    reply({ ok: false, error: String(error?.message ?? error) });
  }
};
