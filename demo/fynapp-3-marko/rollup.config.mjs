import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import markoPlugin from "@marko/rollup";
import json from "@rollup/plugin-json";

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

export default [
  {
    input: [
      "src/index.js",
      // this is the filename from federation plugin config.
      "fynapp-entry.js",
    ],
    output: [
      {
        dir: "dist",
        format: "system",
        sourcemap: true,
      },
    ],
    plugins: [
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
        shareScope: "fynmesh",
        // this filename must be in the input config array
        filename: "fynapp-entry.js",
        exposes: {
          "./bootstrap": "./src/bootstrap.js",
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
    ],
  },
];
