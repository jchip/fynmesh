import { nodeResolve } from "@rollup/plugin-node-resolve";

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
        extensions: [".js", ".ts"],
        mainFields: ["module", "main"],
        exportConditions: [env, "default"],
      }),
      ...setupTypeScriptPlugins(),
      ...setupFederationPlugins({
        name: "fynapp-analytics-lib",
        shareScope: fynmeshShareScope,
        exposes: {},
        shared: {
          "analytics-core": {
            singleton: true,
            semver: "^1.0.0",
          },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
