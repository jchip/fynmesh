import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
// import alias from "@rollup/plugin-alias";
import markoPlugin from "@marko/rollup";
import json from "@rollup/plugin-json";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupMinifyPlugins,
  setupFederationPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(markoPlugin.browser)(),
      newRollupPlugin(resolve)({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".marko"],
      }),
      newRollupPlugin(commonjs)({
        transformMixedEsModules: true,
        extensions: [".js", ".marko"],
      }),
      newRollupPlugin(json)(),
      ...setupFederationPlugins({
        name: "fynapp-3-marko",
        exposes: {
          "./main": "./src/main.js",
        },
        shared: {
          marko: {
            singleton: true,
            requiredVersion: "^5.37.31",
          },
        },
      }),
      // newRollupPlugin(alias)({
      //   entries: {
      //     // If needed for aliasing
      //   },
      // }),
      ...setupMinifyPlugins(),
    ].filter(Boolean),
  }),
];
