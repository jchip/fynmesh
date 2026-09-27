// @ts-ignore - esm wrapper, types come from ag-grid-community
import * as community from "esm-ag-grid";
// @ts-ignore - esm wrapper, types come from ag-grid-enterprise
import * as enterprise from "esm-ag-grid-enterprise";
import type * as Community from "ag-grid-community";
import type * as Enterprise from "ag-grid-enterprise";

const grid = community as typeof Community;
const ent = enterprise as typeof Enterprise;

/**
 * Only the modules this grid uses. They register onto the shared community
 * registry from fynapp-ag-grid-lib, so every grid on the page sees them.
 */
grid.ModuleRegistry.registerModules([
  // community
  grid.TextFilterModule,
  grid.NumberFilterModule,
  grid.DateFilterModule,
  grid.RowStyleModule,
  grid.CellStyleModule,
  grid.TooltipModule,
  grid.RowApiModule,
  grid.ScrollApiModule,
  grid.RenderApiModule,
  grid.ColumnApiModule,
  // enterprise
  ent.ServerSideRowModelModule,
  ent.ServerSideRowModelApiModule,
  ent.RowGroupingModule,
  ent.ExcelExportModule,
]);

export const { themeQuartz } = grid;
