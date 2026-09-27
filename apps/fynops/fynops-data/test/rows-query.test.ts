import { describe, expect, it } from "vitest";
import type { ServerSideRowsRequest } from "fynops-data-core";
import { buildShipmentRowsQuery } from "../src/rows-query.ts";

const LANE = { id: "lane", field: "lane" };
const CARRIER = { id: "carrier", field: "carrier" };

function req(partial: Partial<ServerSideRowsRequest> = {}): ServerSideRowsRequest {
  return { startRow: 0, endRow: 100, rowGroupCols: [], groupKeys: [], valueCols: [], sortModel: [], ...partial };
}

/** Whatever the value, it must reach the database as a bound parameter, never as SQL text. */
function expectBound(q: { sql: string; params: unknown[] }, value: unknown) {
  expect(q.params).toContainEqual(value);
  expect(q.sql).not.toContain(String(value));
}

describe("group levels", () => {
  it("returns lane groups at the first level, with aggregates and a child count", () => {
    const q = buildShipmentRowsQuery(
      req({ rowGroupCols: [LANE, CARRIER], valueCols: [{ id: "rate_usd", aggFunc: "sum" }] }),
    );
    expect(q.level).toBe("group");
    expect(q.groupColId).toBe("lane");
    expect(q.sql).toContain("(o.code || '-' || d.code) AS lane");
    expect(q.sql).toContain("sum(s.rate_usd) AS rate_usd");
    expect(q.sql).toContain("count(*) AS childCount");
    expect(q.sql).toContain("GROUP BY (o.code || '-' || d.code)");
    expect(q.params).toEqual([100, 0]);
    expect(q.countSql).toContain("SELECT count(*) FROM (SELECT 1");
  });

  it("returns carrier groups under one lane at the second level", () => {
    const q = buildShipmentRowsQuery(req({ rowGroupCols: [LANE, CARRIER], groupKeys: ["CHI-DAL"] }));
    expect(q.level).toBe("group");
    expect(q.groupColId).toBe("carrier");
    expect(q.sql).toContain("c.name AS carrier");
    expect(q.sql).toContain("(o.code || '-' || d.code) = ?");
    expect(q.sql).toContain("GROUP BY c.name");
    expectBound(q, "CHI-DAL");
    expect(q.countParams).toEqual(["CHI-DAL"]);
  });

  it("returns leaf rows once every level is keyed", () => {
    const q = buildShipmentRowsQuery(req({ rowGroupCols: [LANE, CARRIER], groupKeys: ["CHI-DAL", "Prairie Line"] }));
    expect(q.level).toBe("leaf");
    expect(q.sql).toContain("s.ref AS ref");
    expect(q.sql).not.toContain("GROUP BY");
    expect(q.params.slice(0, 2)).toEqual(["CHI-DAL", "Prairie Line"]);
  });

  it("matches a null group key with IS NULL", () => {
    const q = buildShipmentRowsQuery(req({ rowGroupCols: [{ id: "vehicle_id" }], groupKeys: [null] }));
    expect(q.sql).toContain("s.vehicle_id IS NULL");
    expect(q.params).toEqual([100, 0]);
  });

  it("supports avg, min, max and count, and rejects anything else", () => {
    const q = buildShipmentRowsQuery(
      req({
        rowGroupCols: [LANE],
        valueCols: [
          { id: "weight_lbs", aggFunc: "avg" },
          { id: "pieces", aggFunc: "max" },
          { id: "miles", aggFunc: "min" },
          { id: "id", aggFunc: "count" },
          { id: "rate_usd" },
        ],
      }),
    );
    expect(q.sql).toContain("avg(s.weight_lbs) AS weight_lbs");
    expect(q.sql).toContain("max(s.pieces) AS pieces");
    expect(q.sql).toContain("min(l.miles) AS miles");
    expect(q.sql).toContain("count(s.id) AS id");
    expect(q.sql).toContain("sum(s.rate_usd) AS rate_usd");
    expect(() =>
      buildShipmentRowsQuery(req({ rowGroupCols: [LANE], valueCols: [{ id: "rate_usd", aggFunc: "median" }] })),
    ).toThrow(/aggFunc/);
  });

  it("throws when there are more keys than group columns", () => {
    expect(() => buildShipmentRowsQuery(req({ rowGroupCols: [LANE], groupKeys: ["a", "b"] }))).toThrow();
  });
});

describe("block range", () => {
  it("turns startRow/endRow into LIMIT/OFFSET params", () => {
    const q = buildShipmentRowsQuery(req({ startRow: 200, endRow: 300 }));
    expect(q.sql).toMatch(/LIMIT \? OFFSET \?$/);
    expect(q.params).toEqual([100, 200]);
  });

  it("caps an oversized block", () => {
    const q = buildShipmentRowsQuery(req({ startRow: 0, endRow: 1_000_000 }));
    expect(q.params).toEqual([5000, 0]);
  });
});

describe("sorting", () => {
  it("sorts leaf rows by any known column and tie-breaks on id", () => {
    const q = buildShipmentRowsQuery(
      req({ sortModel: [{ colId: "due_at", sort: "desc" }, { colId: "carrier", sort: "asc" }] }),
    );
    expect(q.sql).toContain("ORDER BY s.due_at DESC, c.name ASC, s.id ASC");
  });

  it("at a group level, sorts only by the group column or an aggregate", () => {
    const q = buildShipmentRowsQuery(
      req({
        rowGroupCols: [LANE],
        valueCols: [{ id: "rate_usd", aggFunc: "sum" }],
        sortModel: [
          { colId: "rate_usd", sort: "desc" },
          { colId: "due_at", sort: "asc" },
          { colId: "lane", sort: "desc" },
        ],
      }),
    );
    expect(q.sql).toContain(
      "ORDER BY rate_usd DESC, (o.code || '-' || d.code) DESC, (o.code || '-' || d.code) ASC",
    );
    expect(q.sql).not.toContain("s.due_at ASC");
  });

  it("rejects an unknown sort column", () => {
    expect(() => buildShipmentRowsQuery(req({ sortModel: [{ colId: "1; DROP TABLE shipments", sort: "asc" }] }))).toThrow(
      /unknown column/,
    );
  });
});

describe("text filters", () => {
  const cases: Array<[string, string, string]> = [
    ["contains", "c.name LIKE ? ESCAPE '\\'", "%Prairie%"],
    ["notContains", "(c.name IS NULL OR c.name NOT LIKE ? ESCAPE '\\')", "%Prairie%"],
    ["startsWith", "c.name LIKE ? ESCAPE '\\'", "Prairie%"],
    ["endsWith", "c.name LIKE ? ESCAPE '\\'", "%Prairie"],
    ["equals", "lower(c.name) = lower(?)", "Prairie"],
    ["notEqual", "(c.name IS NULL OR lower(c.name) <> lower(?))", "Prairie"],
  ];
  for (const [type, sql, param] of cases) {
    it(type, () => {
      const q = buildShipmentRowsQuery(
        req({ filterModel: { carrier: { filterType: "text", type: type as any, filter: "Prairie" } } }),
      );
      expect(q.sql).toContain(sql);
      expect(q.params[0]).toBe(param);
      expect(q.sql).not.toContain("Prairie");
    });
  }

  it("blank and notBlank bind nothing", () => {
    const blank = buildShipmentRowsQuery(req({ filterModel: { ref: { filterType: "text", type: "blank" } } }));
    expect(blank.sql).toContain("(s.ref IS NULL OR s.ref = '')");
    const notBlank = buildShipmentRowsQuery(req({ filterModel: { ref: { filterType: "text", type: "notBlank" } } }));
    expect(notBlank.sql).toContain("(s.ref IS NOT NULL AND s.ref <> '')");
    expect(blank.params).toEqual([100, 0]);
  });

  it("escapes LIKE wildcards in the user's text", () => {
    const q = buildShipmentRowsQuery(
      req({ filterModel: { ref: { filterType: "text", type: "contains", filter: "50%_off\\" } } }),
    );
    expect(q.params[0]).toBe("%50\\%\\_off\\\\%");
  });

  it("binds a quote-laden value instead of splicing it into the SQL", () => {
    const evil = "x' OR '1'='1";
    const q = buildShipmentRowsQuery(req({ filterModel: { status: { filterType: "text", type: "equals", filter: evil } } }));
    expectBound(q, evil);
  });
});

describe("number filters", () => {
  const cases: Array<[string, string]> = [
    ["equals", "s.weight_lbs = ?"],
    ["notEqual", "(s.weight_lbs IS NULL OR s.weight_lbs <> ?)"],
    ["lessThan", "s.weight_lbs < ?"],
    ["lessThanOrEqual", "s.weight_lbs <= ?"],
    ["greaterThan", "s.weight_lbs > ?"],
    ["greaterThanOrEqual", "s.weight_lbs >= ?"],
  ];
  for (const [type, sql] of cases) {
    it(type, () => {
      const q = buildShipmentRowsQuery(
        req({ filterModel: { weight_lbs: { filterType: "number", type: type as any, filter: 31337 } } }),
      );
      expect(q.sql).toContain(sql);
      expectBound(q, 31337);
    });
  }

  it("inRange is exclusive at both ends", () => {
    const q = buildShipmentRowsQuery(
      req({ filterModel: { rate_usd: { filterType: "number", type: "inRange", filter: 1000, filterTo: 2000 } } }),
    );
    expect(q.sql).toContain("(s.rate_usd > ? AND s.rate_usd < ?)");
    expect(q.params.slice(0, 2)).toEqual([1000, 2000]);
  });

  it("blank and notBlank", () => {
    expect(
      buildShipmentRowsQuery(req({ filterModel: { vehicle_id: { filterType: "number", type: "blank" } } })).sql,
    ).toContain("s.vehicle_id IS NULL");
    expect(
      buildShipmentRowsQuery(req({ filterModel: { vehicle_id: { filterType: "number", type: "notBlank" } } })).sql,
    ).toContain("s.vehicle_id IS NOT NULL");
  });
});

describe("date filters", () => {
  it("compares days, whatever time the grid sends", () => {
    const q = buildShipmentRowsQuery(
      req({ filterModel: { due_at: { filterType: "date", type: "greaterThan", dateFrom: "2026-09-10 00:00:00" } } }),
    );
    expect(q.sql).toContain("substr(s.due_at, 1, 10) > ?");
    expect(q.params[0]).toBe("2026-09-10");
  });

  it("inRange binds both ends", () => {
    const q = buildShipmentRowsQuery(
      req({
        filterModel: {
          pickup_at: { filterType: "date", type: "inRange", dateFrom: "2026-09-01", dateTo: "2026-09-05 00:00:00" },
        },
      }),
    );
    expect(q.sql).toContain("(substr(s.pickup_at, 1, 10) > ? AND substr(s.pickup_at, 1, 10) < ?)");
    expect(q.params.slice(0, 2)).toEqual(["2026-09-01", "2026-09-05"]);
  });

  it("blank matches undelivered shipments", () => {
    const q = buildShipmentRowsQuery(req({ filterModel: { delivered_at: { filterType: "date", type: "blank" } } }));
    expect(q.sql).toContain("s.delivered_at IS NULL");
  });
});

describe("set filters", () => {
  it("binds each value into an IN list", () => {
    const q = buildShipmentRowsQuery(
      req({ filterModel: { status: { filterType: "set", values: ["delayed", "exception"] } } }),
    );
    expect(q.sql).toContain("(s.status IN (?, ?))");
    expect(q.params.slice(0, 2)).toEqual(["delayed", "exception"]);
  });

  it("a null value adds IS NULL", () => {
    const q = buildShipmentRowsQuery(req({ filterModel: { vehicle_id: { filterType: "set", values: [3, null] } } }));
    expect(q.sql).toContain("(s.vehicle_id IN (?) OR s.vehicle_id IS NULL)");
  });

  it("an empty selection matches nothing", () => {
    const q = buildShipmentRowsQuery(req({ filterModel: { status: { filterType: "set", values: [] } } }));
    expect(q.sql).toContain("WHERE 0");
  });
});

describe("combined filters and filters with groups", () => {
  it("joins conditions with OR", () => {
    const q = buildShipmentRowsQuery(
      req({
        filterModel: {
          weight_lbs: {
            filterType: "number",
            operator: "OR",
            conditions: [
              { filterType: "number", type: "lessThan", filter: 1000 },
              { filterType: "number", type: "greaterThan", filter: 40000 },
            ],
          },
        },
      }),
    );
    expect(q.sql).toContain("(s.weight_lbs < ? OR s.weight_lbs > ?)");
    expect(q.params.slice(0, 2)).toEqual([1000, 40000]);
  });

  it("accepts the legacy condition1/condition2 form", () => {
    const q = buildShipmentRowsQuery(
      req({
        filterModel: {
          carrier: {
            filterType: "text",
            operator: "AND",
            condition1: { filterType: "text", type: "startsWith", filter: "Blue" },
            condition2: { filterType: "text", type: "notContains", filter: "Ridge" },
          },
        },
      }),
    );
    expect(q.sql).toContain("(c.name LIKE ? ESCAPE '\\' AND (c.name IS NULL OR c.name NOT LIKE ? ESCAPE '\\'))");
  });

  it("puts filter params before group key params, in SQL order", () => {
    const q = buildShipmentRowsQuery(
      req({
        rowGroupCols: [LANE, CARRIER],
        groupKeys: ["CHI-DAL"],
        filterModel: { status: { filterType: "set", values: ["delayed"] } },
      }),
    );
    expect(q.sql.indexOf("s.status IN")).toBeLessThan(q.sql.indexOf("(o.code || '-' || d.code) = ?"));
    expect(q.params).toEqual(["delayed", "CHI-DAL", 100, 0]);
    expect(q.countParams).toEqual(["delayed", "CHI-DAL"]);
  });

  it("rejects a filter on an unknown column", () => {
    expect(() =>
      buildShipmentRowsQuery(req({ filterModel: { secret: { filterType: "text", type: "equals", filter: "x" } } })),
    ).toThrow(/unknown column/);
  });
});
