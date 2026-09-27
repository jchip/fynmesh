import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "spike-data",
  framework: "vanilla",
  typescript: true,
  exposes: {
    "./main": "./src/main.ts",
  },
  // Consumed from fynops-data, never bundled here.
  external: ["fynops-data-core"],
  shared: {
    "fynops-data-core": { import: false, singleton: true, semver: "^1.0.0" },
  },
});
