import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import replace from "@rollup/plugin-replace";
import vue from "rollup-plugin-vue";
import postcss from "rollup-plugin-postcss";
import json from "@rollup/plugin-json";
import virtual from "@rollup/plugin-virtual";
import noEmit from "rollup-plugin-no-emit";
import { newRollupPlugin } from "create-fynapp";

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

/**
 * Rollup needs at least one entry to get the build started.  We use a virtual entry
 * to satisfy this requirement.  The dummy entry is not used.
 */
const fynappDummyEntryName = "fynapp-dummy-entry";
/**
 * The filename of the entry point for the fynapp's module federation bundle.
 * This is the file that will be used by the fynmesh to load the fynapp.
 */
const fynappEntryFilename = "fynapp-entry.js";
/**
 * The module federation share scope for the fynmesh.  This is the scope that will be used to share
 * modules between the fynmesh and the fynapps.
 */
const fynmeshShareScope = "fynmesh";

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
      newRollupPlugin(virtual)({
        [fynappDummyEntryName]: "// fynapp dummy entry\nconsole.log('fynapp dummy entry');",
      }),
      newRollupPlugin(noEmit)({
        match: (fileName) => fileName.includes(fynappDummyEntryName),
      }),
      newRollupPlugin(vue)({
        css: false, // Handled by postcss plugin
        template: {
          isProduction,
        },
      }),
      newRollupPlugin(postcss)(),
      newRollupPlugin(replace)({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: !isProduction,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
      }),
      newRollupPlugin(resolve)({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".vue", ".ts"],
      }),
      newRollupPlugin(commonjs)({ transformMixedEsModules: true }),
      newRollupPlugin(json)(),
      newRollupPlugin(federation)({
        name: "fynapp-4-vue",
        shareScope: fynmeshShareScope,
        // this filename must be in the input config array
        filename: fynappEntryFilename,
        exposes: {
          "./main": "./src/main.js",
        },
        shared: {
          vue: {
            singleton: true,
            requiredVersion: "^3.3.4",
          },
        },
      }),
      newRollupPlugin(alias)({
        entries: {
          // If needed for aliasing
        },
      }),
      isProduction ? newRollupPlugin(terser)() : null,
    ].filter(Boolean),
  },
];
