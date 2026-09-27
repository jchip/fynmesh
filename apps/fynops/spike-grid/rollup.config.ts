import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "spike-grid",
  framework: "react",
  reactPackages: "esm-adapters",
  typescript: true,
  exposes: {},
  external: ["esm-react", "esm-react-dom", "esm-ag-grid", "esm-ag-grid-react", "esm-ag-grid-enterprise"],
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
  },
  federationOptions: {
    sharedProviders: {
      "fynapp-react-lib": { semver: "^19.0.0", provides: ["esm-react", "esm-react-dom"] },
      "fynapp-ag-grid-lib": { semver: "^35.3.1", provides: ["esm-ag-grid", "esm-ag-grid-react"] },
      "fynops-grid-lib": { semver: "^35.3.1", provides: ["esm-ag-grid-enterprise"] },
    },
  },
});
