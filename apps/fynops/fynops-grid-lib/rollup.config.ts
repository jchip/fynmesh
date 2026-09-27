import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappEntryFilename,
  setupMinifyPlugins,
  setupFederationPlugins,
  fynmeshShareScope,
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: ["src/index.ts", fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    plugins: [
      newRollupPlugin(nodeResolve)({
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        mainFields: ["module", "main"],
        preferBuiltins: false,
        browser: true,
        exportConditions: [env, "default"],
      }),
      newRollupPlugin(replace)({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
      }),
      ...setupTypeScriptPlugins(),
      ...setupFederationPlugins({
        name: "fynops-grid-lib",
        shareScope: fynmeshShareScope,
        exposes: {},
        shared: {
          // Consumed, not provided: fynapp-ag-grid-lib provides community.
          "esm-ag-grid": {
            import: false,
            singleton: true,
            semver: "^35.0.0",
          },
          "esm-ag-grid-enterprise": {
            singleton: true,
            semver: "^35.0.0",
            requiredVersion: {
              "esm-ag-grid": "^35.0.0",
            },
          },
        },
        sharedProviders: {
          "fynapp-ag-grid-lib": {
            semver: "^35.3.1",
            provides: ["esm-ag-grid"],
          },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
