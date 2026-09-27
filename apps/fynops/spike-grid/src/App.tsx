import React, { useMemo } from "react";
// @ts-ignore - esm wrapper
import { AgGridReact } from "esm-ag-grid-react";
// @ts-ignore - esm wrapper
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "esm-ag-grid";
// @ts-ignore - esm wrapper
import { RowGroupingModule } from "esm-ag-grid-enterprise";
import type { ColDef } from "ag-grid-community";

// Enterprise registers onto the shared community registry. If a second
// community copy were loaded, this would land in a registry the grid never reads.
ModuleRegistry.registerModules([AllCommunityModule, RowGroupingModule]);

interface Shipment {
  id: string;
  lane: string;
  carrier: string;
  status: string;
  weight: number;
  cost: number;
}

const LANES = ["CHI-DAL", "LAX-PHX", "ATL-MIA", "NYC-BOS", "SEA-PDX", "DEN-SLC", "HOU-NOL", "DET-CLE"];
const CARRIERS = ["Acme Freight", "Blue Line", "Crosstown", "Delta Haul", "Eagle Express"];
const STATUSES = ["booked", "in-transit", "delivered", "delayed"];

// Seeded so every load shows the same rows.
function makeRows(count: number): Shipment[] {
  let seed = 42;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  return Array.from({ length: count }, (_, i) => {
    const weight = Math.round(500 + rand() * 20000);
    return {
      id: `SH-${String(i + 1).padStart(6, "0")}`,
      lane: pick(LANES),
      carrier: pick(CARRIERS),
      status: pick(STATUSES),
      weight,
      cost: Math.round(weight * (0.08 + rand() * 0.05)),
    };
  });
}

const App: React.FC = () => {
  const rowData = useMemo(() => makeRows(10_000), []);
  const columnDefs = useMemo<ColDef<Shipment>[]>(
    () => [
      { field: "lane", rowGroup: true, hide: true },
      { field: "carrier", rowGroup: true, hide: true },
      { field: "id" },
      { field: "status" },
      { field: "weight", aggFunc: "sum" },
      { field: "cost", aggFunc: "sum" },
    ],
    [],
  );

  return (
    <div style={{ padding: "1rem 2rem", fontFamily: "system-ui, sans-serif" }}>
      <h2 data-testid="spike-grid-title">spike-grid: {rowData.length} shipments by lane and carrier</h2>
      <div style={{ height: 600 }}>
        <AgGridReact<Shipment>
          theme={themeQuartz}
          rowData={rowData}
          columnDefs={columnDefs}
          groupDisplayType="multipleColumns"
          autoGroupColumnDef={{ minWidth: 200 }}
        />
      </div>
    </div>
  );
};

export default App;
