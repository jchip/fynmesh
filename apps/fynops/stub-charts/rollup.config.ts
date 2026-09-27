import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "stub-charts",
  framework: "vanilla",
  typescript: true,
  exposes: {
    "./main": "./src/main.ts",
  },
  external: ["esm-echarts"],
  shared: {
    "esm-echarts": { import: false, singleton: true, semver: "^6.0.0" },
  },
  federationOptions: {
    sharedProviders: {
      "fynops-charts-lib": { semver: "^6.1.0", provides: ["esm-echarts"] },
    },
  },
});
