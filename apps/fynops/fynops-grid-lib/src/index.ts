// Share AG Grid enterprise for federation. Community is not bundled here:
// esm-ag-grid-enterprise imports it as esm-ag-grid, which fynapp-ag-grid-lib
// provides, so enterprise registers onto the one shared community instance.
// @ts-ignore - esm wrapper
export { AllEnterpriseModule, RowGroupingModule, LicenseManager } from "esm-ag-grid-enterprise";

console.log("fynops-grid-lib loaded - AG Grid enterprise shared library provider");
