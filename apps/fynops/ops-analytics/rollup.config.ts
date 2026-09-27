import { createFynAppRollupConfig } from "create-fynapp";

// Every library here is a shared module consumed with import:false, never
// bundled. The providers (fynops-ui, fynops-data, fynops-charts-lib) are
// package.json dependencies, which is how create-fynapp fills in the
// manifest's `shared-providers`, so the kernel can load them by name before
// this app. Modeled on ops-shipments, the other echarts + fynops-ui-kit +
// fynops-data-core consumer.
export default createFynAppRollupConfig({
  name: "ops-analytics",
  framework: "react",
  reactPackages: "esm-adapters",
  typescript: true,
  exposes: {},
  external: ["esm-react", "esm-react-dom", "esm-echarts", "fynops-ui-kit", "fynops-data-core"],
  shared: {
    "esm-echarts": { import: false, singleton: true, semver: "^6.0.0" },
    "fynops-ui-kit": { import: false, singleton: true, semver: "^1.0.0" },
    "fynops-data-core": { import: false, singleton: true, semver: "^1.0.0" },
  },
});
