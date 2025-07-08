import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import federation from "rollup-plugin-federation";
// import alias from "@rollup/plugin-alias";
import markoPlugin from "@marko/rollup";
import json from "@rollup/plugin-json";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupMinifyPlugins,
  fynmeshShareScope,
} from "create-fynapp";

export default [
  {
    input: [fynappDummyEntryName, fynappEntryFilename],
    output: [
      {
        dir: "dist",
        format: "system",
        sourcemap: true,
      },
    ],
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
      newRollupPlugin(federation)({
        name: "fynapp-3-marko",
        shareScope: fynmeshShareScope,
        // this filename must be in the input config array
        filename: fynappEntryFilename,
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
  },
];
