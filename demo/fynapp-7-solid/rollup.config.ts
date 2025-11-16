import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
// import alias from "@rollup/plugin-alias";
import babel from "@rollup/plugin-babel";
import postcss from "rollup-plugin-postcss";
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
      newRollupPlugin(babel)({
        babelHelpers: "bundled",
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        presets: [
          ["@babel/preset-env", { targets: "defaults" }],
          "babel-preset-solid",
        ],
      }),
      newRollupPlugin(postcss)(),
      newRollupPlugin(resolve)({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      }),
      newRollupPlugin(commonjs)({ transformMixedEsModules: true }),
      newRollupPlugin(json)(),
      ...setupFederationPlugins({
        name: "fynapp-7-solid",
        exposes: {
          "./main": "./src/main.js",
        },
        shared: {
          "solid-js": {
            singleton: true,
            semver: "^1.8.15",
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
