/**
 * ag-grid server-side row model request → parameterized SQL.
 *
 * Pure: no database, no worker. Every value from the request is bound as a
 * parameter. Column ids map through a fixed table to SQL expressions, and an
 * id that is not in the table throws, so no request text ever reaches the SQL
 * string.
 *
 * One request answers one level of the grid:
 * - While `groupKeys` is shorter than `rowGroupCols`, it returns group rows for
 *   the next group column, with aggregates for the value columns.
 * - Once every group level is keyed, it returns leaf shipment rows.
 * Filters always apply to the underlying shipments, before grouping.
 */
import {
  SHIPMENT_COLUMNS,
  type ColumnFilter,
  type CombinedFilter,
  type DateFilter,
  type NumberFilter,
  type ServerSideRowsRequest,
  type SetFilter,
  type ShipmentColumnId,
  type SimpleFilter,
  type TextFilter,
} from "fynops-data-core";

/** SQL expression per column id. Keys match SHIPMENT_COLUMNS exactly. */
const COLUMN_SQL: Record<ShipmentColumnId, string> = {
  id: "s.id",
  ref: "s.ref",
  status: "s.status",
  carrier: "c.name",
  carrier_id: "s.carrier_id",
  lane: "(o.code || '-' || d.code)",
  lane_id: "s.lane_id",
  origin: "o.code",
  destination: "d.code",
  vehicle_id: "s.vehicle_id",
  weight_lbs: "s.weight_lbs",
  pieces: "s.pieces",
  rate_usd: "s.rate_usd",
  miles: "l.miles",
  pickup_at: "s.pickup_at",
  due_at: "s.due_at",
  delivered_at: "s.delivered_at",
};

export const SHIPMENTS_FROM =
  "FROM shipments s JOIN carriers c ON c.id = s.carrier_id JOIN lanes l ON l.id = s.lane_id" +
  " JOIN warehouses o ON o.id = l.origin_id JOIN warehouses d ON d.id = l.destination_id";

/** Every column, aliased to its id: the leaf row shape. */
export const LEAF_SELECT = (Object.keys(COLUMN_SQL) as ShipmentColumnId[])
  .map((id) => `${COLUMN_SQL[id]} AS ${id}`)
  .join(", ");

const AGG_FUNCS = new Set(["sum", "avg", "min", "max", "count"]);
const DEFAULT_BLOCK = 100;
const MAX_BLOCK = 5000;

export interface RowsQuery {
  level: "group" | "leaf";
  /** the group column id at a group level */
  groupColId?: string;
  sql: string;
  params: unknown[];
  /** total rows at this level, ignoring the block range */
  countSql: string;
  countParams: unknown[];
}

function columnSql(colId: string): string {
  if (!Object.hasOwn(COLUMN_SQL, colId)) throw new Error(`unknown column: ${colId}`);
  return COLUMN_SQL[colId as ShipmentColumnId];
}

/** Escape LIKE wildcards so a user's `%` or `_` matches literally. */
function likeArg(value: unknown, prefix: string, suffix: string): string {
  return prefix + String(value ?? "").replace(/[\\%_]/g, (ch) => `\\${ch}`) + suffix;
}

function textCondition(expr: string, f: TextFilter, params: unknown[]): string {
  switch (f.type) {
    case "contains":
      params.push(likeArg(f.filter, "%", "%"));
      return `${expr} LIKE ? ESCAPE '\\'`;
    case "notContains":
      params.push(likeArg(f.filter, "%", "%"));
      return `(${expr} IS NULL OR ${expr} NOT LIKE ? ESCAPE '\\')`;
    case "startsWith":
      params.push(likeArg(f.filter, "", "%"));
      return `${expr} LIKE ? ESCAPE '\\'`;
    case "endsWith":
      params.push(likeArg(f.filter, "%", ""));
      return `${expr} LIKE ? ESCAPE '\\'`;
    // ag-grid's text filter ignores case by default.
    case "equals":
      params.push(f.filter ?? "");
      return `lower(${expr}) = lower(?)`;
    case "notEqual":
      params.push(f.filter ?? "");
      return `(${expr} IS NULL OR lower(${expr}) <> lower(?))`;
    case "blank":
      return `(${expr} IS NULL OR ${expr} = '')`;
    case "notBlank":
      return `(${expr} IS NOT NULL AND ${expr} <> '')`;
    default:
      throw new Error(`unsupported text filter type: ${(f as TextFilter).type}`);
  }
}

const NUMBER_OPS: Record<string, string> = {
  equals: "=",
  lessThan: "<",
  lessThanOrEqual: "<=",
  greaterThan: ">",
  greaterThanOrEqual: ">=",
};

function numberCondition(expr: string, f: NumberFilter, params: unknown[]): string {
  if (f.type === "blank") return `${expr} IS NULL`;
  if (f.type === "notBlank") return `${expr} IS NOT NULL`;
  if (f.type === "notEqual") {
    params.push(f.filter);
    return `(${expr} IS NULL OR ${expr} <> ?)`;
  }
  if (f.type === "inRange") {
    params.push(f.filter, f.filterTo);
    return `(${expr} > ? AND ${expr} < ?)`;
  }
  const op = NUMBER_OPS[f.type];
  if (!op) throw new Error(`unsupported number filter type: ${f.type}`);
  params.push(f.filter);
  return `${expr} ${op} ?`;
}

/** Stored dates are ISO ("2026-09-01T08:00:00Z"); the grid sends "2026-09-01 00:00:00". Compare days. */
function dateCondition(expr: string, f: DateFilter, params: unknown[]): string {
  const day = `substr(${expr}, 1, 10)`;
  const arg = (v: string | null | undefined) => String(v ?? "").slice(0, 10);
  switch (f.type) {
    case "equals":
      params.push(arg(f.dateFrom));
      return `${day} = ?`;
    case "notEqual":
      params.push(arg(f.dateFrom));
      return `(${expr} IS NULL OR ${day} <> ?)`;
    case "lessThan":
      params.push(arg(f.dateFrom));
      return `${day} < ?`;
    case "greaterThan":
      params.push(arg(f.dateFrom));
      return `${day} > ?`;
    case "inRange":
      params.push(arg(f.dateFrom), arg(f.dateTo));
      return `(${day} > ? AND ${day} < ?)`;
    case "blank":
      return `${expr} IS NULL`;
    case "notBlank":
      return `${expr} IS NOT NULL`;
    default:
      throw new Error(`unsupported date filter type: ${(f as DateFilter).type}`);
  }
}

function setCondition(expr: string, f: SetFilter, params: unknown[]): string {
  const values = f.values.filter((v) => v !== null && v !== undefined);
  const hasNull = values.length !== f.values.length;
  const parts: string[] = [];
  if (values.length) {
    params.push(...values);
    parts.push(`${expr} IN (${values.map(() => "?").join(", ")})`);
  }
  if (hasNull) parts.push(`${expr} IS NULL`);
  // An empty selection matches nothing, as in the grid.
  return parts.length ? `(${parts.join(" OR ")})` : "0";
}

function simpleCondition(expr: string, f: SimpleFilter, params: unknown[]): string {
  if (f.filterType === "text") return textCondition(expr, f, params);
  if (f.filterType === "number") return numberCondition(expr, f, params);
  if (f.filterType === "date") return dateCondition(expr, f, params);
  throw new Error(`unsupported filter type: ${(f as SimpleFilter).filterType}`);
}

function filterCondition(expr: string, f: ColumnFilter, params: unknown[]): string {
  if (f.filterType === "set") return setCondition(expr, f as SetFilter, params);
  if ("operator" in f && f.operator) {
    const c = f as CombinedFilter;
    const conditions = c.conditions ?? [c.condition1, c.condition2].filter((x): x is SimpleFilter => !!x);
    if (!conditions.length) return "1";
    const joiner = c.operator === "OR" ? " OR " : " AND ";
    return `(${conditions.map((cond) => simpleCondition(expr, cond, params)).join(joiner)})`;
  }
  return simpleCondition(expr, f as SimpleFilter, params);
}

/** Build the SQL for one SSRM request against the shipments table. */
export function buildShipmentRowsQuery(req: ServerSideRowsRequest): RowsQuery {
  const rowGroupCols = req.rowGroupCols ?? [];
  const groupKeys = req.groupKeys ?? [];
  const valueCols = req.valueCols ?? [];
  const sortModel = req.sortModel ?? [];

  const where: string[] = [];
  const whereParams: unknown[] = [];

  for (const [colId, filter] of Object.entries(req.filterModel ?? {})) {
    if (!filter) continue;
    where.push(filterCondition(columnSql(colId), filter, whereParams));
  }

  groupKeys.forEach((key, i) => {
    const col = rowGroupCols[i];
    if (!col) throw new Error("more group keys than group columns");
    const expr = columnSql(col.id);
    if (key === null || key === undefined) {
      where.push(`${expr} IS NULL`);
    } else {
      where.push(`${expr} = ?`);
      whereParams.push(key);
    }
  });

  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const start = Math.max(0, Math.floor(req.startRow ?? 0));
  const end = req.endRow === undefined ? start + DEFAULT_BLOCK : Math.floor(req.endRow);
  const limit = Math.min(MAX_BLOCK, Math.max(0, end - start));

  if (groupKeys.length < rowGroupCols.length) {
    const groupCol = rowGroupCols[groupKeys.length];
    const groupExpr = columnSql(groupCol.id);
    const aggregates = valueCols.map((vc) => {
      const fn = (vc.aggFunc ?? "sum").toLowerCase();
      if (!AGG_FUNCS.has(fn)) throw new Error(`unsupported aggFunc: ${vc.aggFunc}`);
      return `${fn}(${columnSql(vc.id)}) AS ${vc.id}`;
    });
    // At a group level only the group column and the aggregates exist to sort by.
    const sortable = new Set([groupCol.id, ...valueCols.map((vc) => vc.id)]);
    const order = sortModel
      .filter((s) => sortable.has(s.colId))
      .map((s) => `${s.colId === groupCol.id ? groupExpr : s.colId} ${s.sort === "desc" ? "DESC" : "ASC"}`);
    order.push(`${groupExpr} ASC`);

    return {
      level: "group",
      groupColId: groupCol.id,
      sql:
        `SELECT ${[`${groupExpr} AS ${groupCol.id}`, ...aggregates, "count(*) AS childCount"].join(", ")}` +
        ` ${SHIPMENTS_FROM}${whereSql} GROUP BY ${groupExpr} ORDER BY ${order.join(", ")} LIMIT ? OFFSET ?`,
      params: [...whereParams, limit, start],
      countSql: `SELECT count(*) FROM (SELECT 1 ${SHIPMENTS_FROM}${whereSql} GROUP BY ${groupExpr})`,
      countParams: [...whereParams],
    };
  }

  const order = sortModel.map((s) => `${columnSql(s.colId)} ${s.sort === "desc" ? "DESC" : "ASC"}`);
  // Tie-break on the key so paging with LIMIT/OFFSET is stable.
  order.push("s.id ASC");
  return {
    level: "leaf",
    sql: `SELECT ${LEAF_SELECT} ${SHIPMENTS_FROM}${whereSql} ORDER BY ${order.join(", ")} LIMIT ? OFFSET ?`,
    params: [...whereParams, limit, start],
    countSql: `SELECT count(*) ${SHIPMENTS_FROM}${whereSql}`,
    countParams: [...whereParams],
  };
}
