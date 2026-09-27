/**
 * SQL for the fixed-shape calls: shipment detail and analytics. Pure strings
 * plus argument checks; the worker runs them. Every value is a bound param.
 */
import type { OnTimeBy } from "fynops-data-core";
import { LEAF_SELECT, SHIPMENTS_FROM } from "./rows-query.ts";

const LANE_EXPR = "(o.code || '-' || d.code)";

export const SHIPMENT_GET_SQL =
  `SELECT ${LEAF_SELECT}, c.dot_number AS carrier_dot,` +
  " o.city AS o_city, o.state AS o_state, o.lat AS o_lat, o.lon AS o_lon," +
  " d.city AS d_city, d.state AS d_state, d.lat AS d_lat, d.lon AS d_lon," +
  " v.plate AS v_plate, v.status AS v_status, v.lat AS v_lat, v.lon AS v_lon" +
  ` ${SHIPMENTS_FROM} LEFT JOIN vehicles v ON v.id = s.vehicle_id WHERE s.id = ?`;

const ON_TIME_KEY: Record<OnTimeBy, string> = {
  carrier: "c.name",
  lane: LANE_EXPR,
  origin: "o.code",
  destination: "d.code",
};

export function onTimeSql(by: OnTimeBy): string {
  const key = ON_TIME_KEY[by];
  if (!key) throw new Error(`onTime: unknown grouping ${by}`);
  // ISO timestamps in one format compare correctly as text.
  return (
    `SELECT ${key} AS key, count(*) AS delivered,` +
    " sum(s.delivered_at <= s.due_at) AS on_time, sum(s.delivered_at > s.due_at) AS late," +
    " round(1.0 * sum(s.delivered_at <= s.due_at) / count(*), 4) AS on_time_rate" +
    ` ${SHIPMENTS_FROM} WHERE s.status = 'delivered' AND s.delivered_at IS NOT NULL` +
    ` GROUP BY ${key} ORDER BY on_time_rate DESC, key ASC`
  );
}

export const LANE_COST_SQL =
  `SELECT ${LANE_EXPR} AS lane, o.code AS origin, d.code AS destination, l.miles AS miles,` +
  " count(*) AS shipments, round(avg(s.rate_usd), 2) AS avg_rate_usd," +
  " round(avg(s.rate_usd) / NULLIF(l.miles, 0), 3) AS cost_per_mile" +
  ` ${SHIPMENTS_FROM} GROUP BY l.id ORDER BY shipments DESC, l.id ASC LIMIT ?`;

export function laneCostLimit(limit: unknown): number {
  const n = limit === undefined ? 20 : Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error("laneCost: limit must be 1..1000");
  return n;
}

/**
 * Daily totals by pickup day for the last `days` days of the data. The window
 * ends at the newest pickup, not today, so a fixed seed gives fixed charts.
 */
export const TREND_SQL =
  "WITH bounds AS (SELECT date(max(pickup_at), ?) AS from_day FROM shipments)" +
  " SELECT substr(s.pickup_at, 1, 10) AS day, count(*) AS shipments," +
  " sum(s.status = 'delivered') AS delivered," +
  " coalesce(sum(s.delivered_at <= s.due_at), 0) AS on_time, coalesce(sum(s.delivered_at > s.due_at), 0) AS late," +
  " round(sum(s.rate_usd), 2) AS revenue_usd" +
  " FROM shipments s, bounds WHERE substr(s.pickup_at, 1, 10) > bounds.from_day" +
  " GROUP BY day ORDER BY day ASC";

export function trendParams(days: unknown): [string] {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 366) throw new Error("trend: days must be 1..366");
  return [`-${n} days`];
}
