import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import markoPlugin from "@marko/rollup";
import json from "@rollup/plugin-json";
import virtual from "@rollup/plugin-virtual";
import noEmit from "rollup-plugin-no-emit";

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
      virtual({
        [fynappDummyEntryName]: "// fynapp dummy entry\nconsole.log('fynapp dummy entry');",
      }),
      noEmit({
        match: (fileName) => fileName.includes(fynappDummyEntryName),
      }),
      markoPlugin.browser(),
      resolve({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".marko"],
      }),
      commonjs({ transformMixedEsModules: true, extensions: [".js", ".marko"] }),
      json(),
      federation({
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
      alias({
        entries: {
          // If needed for aliasing
        },
      }),
      isProduction ? terser() : null,
    ].filter(Boolean),
  },
];
