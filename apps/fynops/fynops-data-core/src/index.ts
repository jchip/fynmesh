/**
 * FynOps data client.
 *
 * The async API every FynOps feature uses to reach the database. The database
 * itself is SQLite wasm on OPFS, running in a worker that fynops-data ships.
 * This module is shared as a singleton, so one page gets one worker.
 *
 * The worker file sits next to the chunk this code is bundled into, so its url
 * comes from `import.meta.url`, never from the page url.
 */

/** Where the data in the database came from on this load. */
export type DataSource = "existing" | "seed-file" | "generated";

export interface DataStatus {
  /** "locked" means another tab holds the database. */
  state: "ready" | "locked" | "error";
  storage?: "opfs" | "memory";
  source?: DataSource;
  /** ms spent opening, importing or seeding before the database was ready */
  loadMs?: number;
  /** per-phase ms: initMs (wasm + VFS), fetchMs, importMs, seedMs */
  timings?: Record<string, number>;
  /** row counts per table */
  counts?: Record<string, number>;
  schemaVersion?: number;
  seedVersion?: number;
  error?: string;
}

export interface ShipmentRow {
  id: number;
  ref: string;
  status: string;
  carrier_id: number;
  carrier: string;
  lane_id: number;
  origin: string;
  destination: string;
  vehicle_id: number | null;
  weight_lbs: number;
  pieces: number;
  rate_usd: number;
  pickup_at: string;
  due_at: string;
  delivered_at: string | null;
}

export type ShipmentSortColumn =
  | "id"
  | "ref"
  | "status"
  | "carrier"
  | "origin"
  | "destination"
  | "weight_lbs"
  | "rate_usd"
  | "pickup_at"
  | "due_at";

export interface ShipmentPageOptions {
  offset?: number;
  limit?: number;
  sort?: Array<{ column: ShipmentSortColumn; dir: "asc" | "desc" }>;
  filter?: { status?: string; carrierId?: number; search?: string };
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface FynOpsData {
  status(): Promise<DataStatus>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  shipments: {
    page(options?: ShipmentPageOptions): Promise<Page<ShipmentRow>>;
  };
  /** Drop the database and load it again from the seed file or the generator. */
  reset(): Promise<DataStatus>;
}

/** Worker protocol. */
export type WorkerOp = "status" | "query" | "shipmentsPage" | "reset";
export interface WorkerRequest {
  id: number;
  op: WorkerOp;
  args?: unknown;
}
export interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export const WORKER_FILE = "fynops-data-worker.js";

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL(WORKER_FILE, import.meta.url), {
    type: "module",
    name: "fynops-data",
  });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const { id, ok, result, error } = event.data;
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);
    if (ok) call.resolve(result);
    else call.reject(new Error(error));
  };
  worker.onerror = (event) => {
    const error = new Error(`fynops-data worker failed: ${event.message || "load error"}`);
    for (const call of pending.values()) call.reject(error);
    pending.clear();
  };
  return worker;
}

function call<T>(op: WorkerOp, args?: unknown): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, op, args } satisfies WorkerRequest);
  });
}

export const fynopsData: FynOpsData = {
  status: () => call<DataStatus>("status"),
  query: <T>(sql: string, params?: unknown[]) => call<T[]>("query", { sql, params }),
  shipments: {
    page: (options = {}) => call<Page<ShipmentRow>>("shipmentsPage", options),
  },
  reset: () => call<DataStatus>("reset"),
};
