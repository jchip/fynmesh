import { createFynAppRollupConfig } from "create-fynapp";

// Every library here is a shared module consumed with import:false, never
// bundled. The providers are package.json dependencies, which is how
// create-fynapp fills in the manifest's `shared-providers`, so the kernel can
// load them by name before this app.
export default createFynAppRollupConfig({
  name: "ops-shipments",
  framework: "react",
  reactPackages: "esm-adapters",
  typescript: true,
  exposes: {},
  external: [
    "esm-react",
    "esm-react-dom",
    "esm-ag-grid",
    "esm-ag-grid-react",
    "esm-ag-grid-enterprise",
    "esm-echarts",
    "fynops-ui-kit",
    "fynops-data-core",
  ],
  shared: {
    "esm-ag-grid": { import: false, singleton: true, semver: "^35.0.0" },
    "esm-ag-grid-react": {
      import: false,
      singleton: true,
      semver: "^35.0.0",
      requiredVersion: { "esm-react": "^19.0.0", "esm-ag-grid": "^35.0.0" },
    },
    "esm-ag-grid-enterprise": {
      import: false,
      singleton: true,
      semver: "^35.0.0",
      requiredVersion: { "esm-ag-grid": "^35.0.0" },
    },
    "esm-echarts": { import: false, singleton: true, semver: "^6.0.0" },
    "fynops-ui-kit": { import: false, singleton: true, semver: "^1.0.0" },
    "fynops-data-core": { import: false, singleton: true, semver: "^1.0.0" },
  },
});
