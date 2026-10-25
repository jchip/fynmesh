import resolve from "@rollup/plugin-node-resolve";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupMinifyPlugins,
  setupFederationPlugins,
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
      }),
      ...setupFederationPlugins({
        name: "fynapp-react19-user",
        exposes: {
          "./main": "./src/main.ts",
        },
        shared: {
          "esm-react": { import: false, singleton: false, semver: "^19.0.0" },
          "esm-react-dom": { import: false, singleton: false, semver: "^19.0.0" },
        },
      }),
      ...setupTypeScriptPlugins(),
      ...setupMinifyPlugins(),
    ].filter(Boolean),
  }),
];
