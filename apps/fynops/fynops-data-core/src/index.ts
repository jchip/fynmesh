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

// ---------------------------------------------------------------------------
// shipments.rows(): the ag-grid server-side row model, answered with SQL.
//
// These are structural copies of the ag-grid request types, so features and
// this package never import ag-grid to talk to each other. A grid's
// IServerSideGetRowsRequest is assignable to ServerSideRowsRequest, and the
// result goes straight into `params.success(result)`.
// ---------------------------------------------------------------------------

/** Column ids `shipments.rows()` understands, with the kind of filter each takes. */
export const SHIPMENT_COLUMNS = {
  id: "number",
  ref: "text",
  status: "text",
  carrier: "text",
  carrier_id: "number",
  /** "ORIGIN-DESTINATION", e.g. "CHI-DAL" */
  lane: "text",
  lane_id: "number",
  origin: "text",
  destination: "text",
  vehicle_id: "number",
  weight_lbs: "number",
  pieces: "number",
  rate_usd: "number",
  miles: "number",
  pickup_at: "date",
  due_at: "date",
  delivered_at: "date",
} as const;

export type ShipmentColumnId = keyof typeof SHIPMENT_COLUMNS;

/** A grouped or value column, as the grid sends it (ag-grid ColumnVO). */
export interface RowsColumn {
  id: string;
  field?: string;
  displayName?: string;
  /** For value columns. Defaults to "sum". */
  aggFunc?: string;
}

export interface RowsSort {
  colId: string;
  sort: "asc" | "desc";
}

export interface TextFilter {
  filterType: "text";
  type:
    | "contains"
    | "notContains"
    | "equals"
    | "notEqual"
    | "startsWith"
    | "endsWith"
    | "blank"
    | "notBlank";
  filter?: string | null;
}

export interface NumberFilter {
  filterType: "number";
  type:
    | "equals"
    | "notEqual"
    | "lessThan"
    | "lessThanOrEqual"
    | "greaterThan"
    | "greaterThanOrEqual"
    | "inRange"
    | "blank"
    | "notBlank";
  filter?: number | null;
  /** upper bound for inRange; the range is exclusive, as in ag-grid's default */
  filterTo?: number | null;
}

export interface DateFilter {
  filterType: "date";
  type: "equals" | "notEqual" | "lessThan" | "greaterThan" | "inRange" | "blank" | "notBlank";
  /** "YYYY-MM-DD" or "YYYY-MM-DD hh:mm:ss"; only the day is compared */
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface SetFilter {
  filterType: "set";
  values: Array<string | number | null>;
}

export type SimpleFilter = TextFilter | NumberFilter | DateFilter;

/** Two or more conditions on one column, joined by AND or OR. */
export interface CombinedFilter {
  filterType: "text" | "number" | "date";
  operator: "AND" | "OR";
  conditions?: SimpleFilter[];
  /** the pre-v29 form ag-grid still sends in some setups */
  condition1?: SimpleFilter;
  condition2?: SimpleFilter;
}

export type ColumnFilter = SimpleFilter | SetFilter | CombinedFilter;

/** ag-grid IServerSideGetRowsRequest, the fields this API reads. */
export interface ServerSideRowsRequest {
  startRow?: number;
  endRow?: number;
  rowGroupCols: RowsColumn[];
  groupKeys: Array<string | number | null>;
  valueCols: RowsColumn[];
  sortModel: RowsSort[];
  filterModel?: Record<string, ColumnFilter> | null;
}

/**
 * The argument to the SSRM datasource's `params.success()`.
 *
 * At a group level each row is `{ [groupColId]: key, [valueColId]: aggregate,
 * childCount }`. At the leaf level each row is a {@link ShipmentLeafRow}.
 * `rowCount` is the total at that level, so the grid knows where the last row is.
 */
export interface ServerSideRowsResult {
  rowData: Array<Record<string, unknown>>;
  rowCount: number;
}

/** A leaf row: every column in {@link SHIPMENT_COLUMNS}. */
export type ShipmentLeafRow = ShipmentRow & { lane: string; miles: number };

// ---------------------------------------------------------------------------
// Detail, positions, analytics
// ---------------------------------------------------------------------------

export interface WarehouseInfo {
  code: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export interface ShipmentDetail extends ShipmentLeafRow {
  carrier_dot: string;
  origin_info: WarehouseInfo;
  destination_info: WarehouseInfo;
  /**
   * The assigned vehicle and where it is now. A vehicle has many shipments and
   * drives one lane at a time, so it may be on another lane: `shipment_id` is
   * the shipment it is carrying right now.
   */
  vehicle: {
    id: number;
    plate: string;
    status: string;
    lat: number;
    lon: number;
    shipment_id: number | null;
  } | null;
}

export interface VehiclePosition {
  id: number;
  lat: number;
  lon: number;
  /** "en_route" while carrying a shipment, else the vehicle's stored status */
  status: string;
  carrier_id: number;
  /** the shipment this vehicle is carrying, if any */
  shipment_id: number | null;
}

/** Payload of the `ops:vehicle.positions` bus topic, emitted once per second. */
export interface VehiclePositionsTick {
  /** increases by one per tick, starting at 1 on each page load and after reset() */
  tick: number;
  /** Date.now() when the worker produced the tick */
  at: number;
  /** every vehicle, moving or not */
  vehicles: VehiclePosition[];
}

export type OnTimeBy = "carrier" | "lane" | "origin" | "destination";

/** Delivered shipments only. On time means delivered_at <= due_at. */
export interface OnTimeRow {
  key: string;
  delivered: number;
  on_time: number;
  late: number;
  /** on_time / delivered, 0..1 */
  on_time_rate: number;
}

export interface LaneCostRow {
  lane: string;
  origin: string;
  destination: string;
  miles: number;
  shipments: number;
  avg_rate_usd: number;
  cost_per_mile: number;
}

/** One row per pickup day, for the last `days` days of the dataset's window. */
export interface TrendRow {
  /** "YYYY-MM-DD" */
  day: string;
  shipments: number;
  delivered: number;
  on_time: number;
  late: number;
  revenue_usd: number;
}

export interface FynOpsData {
  status(): Promise<DataStatus>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  shipments: {
    page(options?: ShipmentPageOptions): Promise<Page<ShipmentRow>>;
    /** One level of the server-side grid: group rows or leaf rows. */
    rows(req: ServerSideRowsRequest): Promise<ServerSideRowsResult>;
    /** null when there is no shipment with that id */
    get(id: number): Promise<ShipmentDetail | null>;
  };
  vehicles: {
    /** Current position of every vehicle, for a first paint before the next tick. */
    positions(): Promise<VehiclePosition[]>;
  };
  analytics: {
    onTime(by: OnTimeBy): Promise<OnTimeRow[]>;
    /** Lanes by shipment count, busiest first. */
    laneCost(options?: { limit?: number }): Promise<LaneCostRow[]>;
    /** Daily totals for the last `days` days of data, oldest first. */
    trend(days: number): Promise<TrendRow[]>;
  };
  simulator: {
    /**
     * Subscribe to the worker's position ticks. Meant for the fynops-data
     * FynApp, which re-emits them on the bus; features subscribe to the
     * `ops:vehicle.positions` topic instead.
     */
    onTick(fn: (tick: VehiclePositionsTick) => void): () => void;
  };
  /** Drop the database and load it again from the seed file or the generator. */
  reset(): Promise<DataStatus>;
}

/** Bus topics fynops-data owns. */
export const TOPIC_VEHICLE_POSITIONS = "ops:vehicle.positions";
/** Request `{ id: number }`, response `ShipmentDetail | null`. */
export const TOPIC_SHIPMENT_GET = "ops:shipment.get";
export interface ShipmentGetRequest {
  id: number;
}

/** Worker protocol. */
export type WorkerOp =
  | "status"
  | "query"
  | "shipmentsPage"
  | "shipmentsRows"
  | "shipmentsGet"
  | "vehiclePositions"
  | "onTime"
  | "laneCost"
  | "trend"
  | "reset";
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
/** Messages the worker sends without a request. */
export interface WorkerEvent {
  event: "positions";
  tick: VehiclePositionsTick;
}

export const WORKER_FILE = "fynops-data-worker.js";

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const tickListeners = new Set<(tick: VehiclePositionsTick) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL(WORKER_FILE, import.meta.url), {
    type: "module",
    name: "fynops-data",
  });
  worker.onmessage = (event: MessageEvent<WorkerResponse | WorkerEvent>) => {
    const data = event.data;
    if ("event" in data) {
      if (data.event === "positions") for (const fn of tickListeners) fn(data.tick);
      return;
    }
    const call = pending.get(data.id);
    if (!call) return;
    pending.delete(data.id);
    if (data.ok) call.resolve(data.result);
    else call.reject(new Error(data.error));
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
    rows: (req) => call<ServerSideRowsResult>("shipmentsRows", req),
    get: (id) => call<ShipmentDetail | null>("shipmentsGet", { id }),
  },
  vehicles: {
    positions: () => call<VehiclePosition[]>("vehiclePositions"),
  },
  analytics: {
    onTime: (by) => call<OnTimeRow[]>("onTime", { by }),
    laneCost: (options = {}) => call<LaneCostRow[]>("laneCost", options),
    trend: (days) => call<TrendRow[]>("trend", { days }),
  },
  simulator: {
    onTick(fn) {
      tickListeners.add(fn);
      getWorker();
      return () => void tickListeners.delete(fn);
    },
  },
  reset: () => call<DataStatus>("reset"),
};
