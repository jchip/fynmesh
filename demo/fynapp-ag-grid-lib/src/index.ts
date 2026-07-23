// Re-export AG Grid modules for federation sharing
// @ts-ignore - esm wrapper
export {
  ModuleRegistry,
  AllCommunityModule,
  ClientSideRowModelModule,
  themeAlpine,
  themeBalham,
  themeQuartz,
  themeMaterial,
} from "esm-ag-grid";

// @ts-ignore - esm wrapper
export { AgGridReact } from "esm-ag-grid-react";

console.log("fynapp-ag-grid-lib loaded - AG Grid shared library provider");
