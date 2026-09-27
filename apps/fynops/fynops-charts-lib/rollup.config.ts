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
    input: [
      "src/index.ts",
      fynappEntryFilename,
    ],
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
        name: "fynops-charts-lib",
        shareScope: fynmeshShareScope,
        exposes: {},
        shared: {
          "esm-echarts": {
            singleton: true,
            semver: "^6.0.0",
          },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
