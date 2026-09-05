import resolve from "@rollup/plugin-node-resolve";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupFederationPlugins,
  setupMinifyPlugins,
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
        extensions: [".mjs", ".js", ".json", ".node", ".ts"],
      }),
      ...setupFederationPlugins({
        name: "fynapp-mw-mismatch",
        exposes: {
          "./main": "./src/main.ts",
        },
        shared: {},
      }),
      ...setupTypeScriptPlugins(),
      ...setupMinifyPlugins(),
    ],
  }),
];
