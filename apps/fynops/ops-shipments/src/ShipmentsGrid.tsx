import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore - esm wrapper, types come from ag-grid-react
import { AgGridReact as AgGridReactUntyped } from "esm-ag-grid-react";
import type { AgGridReact as AgGridReactType } from "ag-grid-react";
import type {
  ColDef,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  IServerSideDatasource,
  RowClassParams,
  RowClickedEvent,
  ValueFormatterParams,
  ValueGetterParams,
} from "ag-grid-community";
import { Button, Toolbar } from "fynops-ui-kit";
import { fynopsData, type ServerSideRowsRequest, type ShipmentLeafRow } from "fynops-data-core";
import type { FynOpsShellApi } from "fynops-shell/api";
import { themeQuartz } from "./grid-modules";
import { LaneTrendCell } from "./lane-trend";
import { StatusBadge, delayHours, formatDate, formatDelay, formatNumber, formatUsd } from "./status";

const AgGridReact = AgGridReactUntyped as typeof AgGridReactType;

type Row = Partial<ShipmentLeafRow> & { childCount?: number };

const GROUPINGS: Array<{ id: string; label: string; cols: string[] }> = [
  { id: "lane,carrier", label: "Lane, then carrier", cols: ["lane", "carrier"] },
  { id: "carrier,lane", label: "Carrier, then lane", cols: ["carrier", "lane"] },
  { id: "status,carrier", label: "Status, then carrier", cols: ["status", "carrier"] },
  { id: "origin,destination", label: "Origin, then destination", cols: ["origin", "destination"] },
  { id: "", label: "No grouping", cols: [] },
];

const EXPORT_TIP =
  "Exports the rows loaded so far. The grid loads rows from the database on demand, " +
  "so groups that were never expanded are not in the file.";

const theme = themeQuartz.withParams({ accentColor: "#4f46e5", headerFontWeight: 600 });

// Module level so every render passes the same objects. A new object makes
// the grid re-apply column state, which would undo a group-by change.
const defaultColDef: ColDef<Row> = { flex: 1, minWidth: 110, sortable: true, floatingFilter: true, resizable: true };
const autoGroupColumnDef: ColDef<Row> = { headerName: "Group", minWidth: 230 };
const getChildCount = (data: Row) => data.childCount ?? 0;

const isLeaf = (data: Row | undefined): data is ShipmentLeafRow => !!data && typeof data.ref === "string";

export const ShipmentsGrid: React.FC<{ shell: FynOpsShellApi }> = ({ shell }) => {
  const apiRef = useRef<GridApi<Row> | undefined>(undefined);
  const selectedRef = useRef<number | undefined>(shell.selection.get().shipmentId);
  const [grouping, setGrouping] = useState(GROUPINGS[0].id);
  const [search, setSearch] = useState("");
  const [topCount, setTopCount] = useState<string>("");

  const columnDefs = useMemo<ColDef<Row>[]>(
    () => [
      {
        colId: "trend",
        headerName: "Lane on-time",
        headerTooltip: "Weekly on-time delivery rate for the lane, drawn with the shared echarts",
        sortable: false,
        filter: false,
        minWidth: 140,
        maxWidth: 150,
        cellRenderer: LaneTrendCell,
      },
      { field: "ref", headerName: "Ref", filter: "agTextColumnFilter", minWidth: 130 },
      {
        field: "status",
        headerName: "Status",
        filter: "agTextColumnFilter",
        enableRowGroup: true,
        // Also renders the group key when rows are grouped by status.
        cellRenderer: (p: ICellRendererParams<Row>) => {
          const status = isLeaf(p.data) ? p.data.status : typeof p.value === "string" ? p.value : undefined;
          return status ? <StatusBadge status={status} /> : null;
        },
        minWidth: 130,
      },
      // A grouped column is hidden: the group column already shows it.
      { field: "lane", headerName: "Lane", filter: "agTextColumnFilter", enableRowGroup: true, initialRowGroupIndex: 0, initialHide: true },
      { field: "carrier", headerName: "Carrier", filter: "agTextColumnFilter", enableRowGroup: true, initialRowGroupIndex: 1, initialHide: true, minWidth: 170 },
      { field: "origin", headerName: "Origin", filter: "agTextColumnFilter", enableRowGroup: true, maxWidth: 120 },
      { field: "destination", headerName: "Destination", filter: "agTextColumnFilter", enableRowGroup: true, maxWidth: 140 },
      {
        field: "weight_lbs",
        headerName: "Weight (lbs)",
        filter: "agNumberColumnFilter",
        aggFunc: "sum",
        allowedAggFuncs: ["sum", "avg"],
        type: "rightAligned",
        valueFormatter: (p: ValueFormatterParams<Row>) => formatNumber(p.value),
      },
      {
        field: "rate_usd",
        headerName: "Rate",
        filter: "agNumberColumnFilter",
        aggFunc: "avg",
        allowedAggFuncs: ["sum", "avg"],
        type: "rightAligned",
        valueFormatter: (p: ValueFormatterParams<Row>) => formatUsd(p.value),
      },
      {
        field: "due_at",
        headerName: "Due",
        filter: "agDateColumnFilter",
        minWidth: 170,
        valueFormatter: (p: ValueFormatterParams<Row>) => formatDate(p.value),
      },
      {
        colId: "delay",
        headerName: "Delay",
        sortable: false,
        filter: false,
        maxWidth: 120,
        valueGetter: (p: ValueGetterParams<Row>) =>
          isLeaf(p.data) ? formatDelay(delayHours(p.data), p.data.status) : "",
      },
    ],
    [],
  );

  const datasource = useMemo<IServerSideDatasource<Row>>(
    () => ({
      getRows: async (params) => {
        try {
          const result = await fynopsData.shipments.rows(params.request as ServerSideRowsRequest);
          if (params.request.groupKeys.length === 0) {
            const grouped = params.request.rowGroupCols.length > 0;
            setTopCount(`${formatNumber(result.rowCount)} ${grouped ? "groups" : "shipments"}`);
          }
          params.success(result as { rowData: Row[]; rowCount: number });
        } catch (err) {
          console.error("ops-shipments: rows() failed", err);
          params.fail();
        }
      },
    }),
    [],
  );

  const getRowId = useCallback((p: GetRowIdParams<Row>) => {
    if (isLeaf(p.data)) return `s${p.data.id}`;
    const level = p.parentKeys?.length ?? 0;
    const col = p.api.getRowGroupColumns()[level]?.getColId();
    return `g:${[...(p.parentKeys ?? []), col ? (p.data as Record<string, unknown>)[col] : ""].join("|")}`;
  }, []);

  const rowClassRules = useMemo(
    () => ({
      "ops-sh-selected": (p: RowClassParams<Row>) => isLeaf(p.data) && p.data.id === selectedRef.current,
    }),
    [],
  );

  // Selection is shell state: set here on row click, or by another feature
  // (the map). Highlight the row when it is loaded.
  useEffect(
    () =>
      shell.selection.subscribe((s) => {
        selectedRef.current = s.shipmentId;
        const api = apiRef.current;
        if (!api || api.isDestroyed()) return;
        api.redrawRows();
        const node = s.shipmentId !== undefined ? api.getRowNode(`s${s.shipmentId}`) : undefined;
        if (node?.displayed) api.ensureNodeVisible(node, "middle");
      }),
    [shell],
  );

  // Search filters by ref, on top of whatever column filters are set.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const timer = setTimeout(() => {
      const model = { ...(api.getFilterModel() ?? {}) };
      const q = search.trim();
      if (q) model.ref = { filterType: "text", type: "contains", filter: q };
      else delete model.ref;
      api.setFilterModel(model);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const onGroupingChange = (id: string) => {
    const api = apiRef.current;
    if (!api) return;
    const prev = GROUPINGS.find((g) => g.id === grouping)?.cols ?? [];
    const next = GROUPINGS.find((g) => g.id === id)?.cols ?? [];
    setGrouping(id);
    api.setColumnsVisible(prev, true);
    api.setColumnsVisible(next, false);
    api.setRowGroupColumns(next);
  };

  const onGridReady = useCallback((e: GridReadyEvent<Row>) => {
    apiRef.current = e.api;
  }, []);

  const onRowClicked = (e: RowClickedEvent<Row>) => {
    if (!isLeaf(e.data)) return;
    shell.selection.set({ shipmentId: e.data.id, vehicleId: e.data.vehicle_id ?? undefined });
    shell.openDrawer("ops-shipments", { id: String(e.data.id) });
  };

  return (
    <div className="ops-sh" data-testid="ops-shipments">
      <Toolbar>
        <input
          className="ops-sh-search"
          type="search"
          placeholder="Search by ref, e.g. SHP-1004"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search shipments by ref"
          data-testid="ops-sh-search"
        />
        <label className="ops-sh-label">
          Group by
          <select
            className="ops-sh-select"
            value={grouping}
            onChange={(e) => onGroupingChange(e.target.value)}
            data-testid="ops-sh-group"
          >
            {GROUPINGS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <span className="ops-sh-spacer" />
        <span className="ops-sh-count" data-testid="ops-sh-count">
          {topCount}
        </span>
        <Button
          variant="secondary"
          title={EXPORT_TIP}
          onClick={() => apiRef.current?.exportDataAsExcel({ fileName: "fynops-shipments.xlsx" })}
          data-testid="ops-sh-export"
        >
          Export to Excel
        </Button>
      </Toolbar>
      <div className="ops-sh-grid">
        <AgGridReact<Row>
          theme={theme}
          rowModelType="serverSide"
          serverSideDatasource={datasource}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          getChildCount={getChildCount}
          getRowId={getRowId}
          rowClassRules={rowClassRules}
          cacheBlockSize={100}
          onRowClicked={onRowClicked}
          onGridReady={onGridReady}
        />
      </div>
    </div>
  );
};
