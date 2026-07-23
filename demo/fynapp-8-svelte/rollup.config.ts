import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import svelte from "rollup-plugin-svelte";
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
      newRollupPlugin(svelte)({
        compilerOptions: {
          dev: env !== "production",
        },
      }),
      newRollupPlugin(postcss)(),
      newRollupPlugin(resolve)({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".svelte", ".ts"],
      }),
      newRollupPlugin(commonjs)({ transformMixedEsModules: true }),
      newRollupPlugin(json)(),
      ...setupFederationPlugins({
        name: "fynapp-8-svelte",
        exposes: {
          "./main": "./src/main.js",
        },
        shared: {
          svelte: {
            singleton: true,
            semver: "^4.0.0",
          },
        },
      }),
      ...setupMinifyPlugins(),
    ].filter(Boolean),
  }),
];
