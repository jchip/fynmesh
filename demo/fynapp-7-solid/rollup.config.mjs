import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import postcss from "rollup-plugin-postcss";
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
      babel({
        babelHelpers: "bundled",
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        presets: [["@babel/preset-env", { targets: "defaults" }], "babel-preset-solid"],
      }),
      postcss(),
      resolve({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      }),
      commonjs({ transformMixedEsModules: true }),
      json(),
      federation({
        name: "fynapp-7-solid",
        shareScope: "fynmesh",
        // this filename must be in the input config array
        filename: "fynapp-entry.js",
        exposes: {
          "./bootstrap": "./src/bootstrap.js",
        },
        shared: {
          "solid-js": {
            singleton: true,
            requiredVersion: "^1.8.15",
          },
        },
      }),
      isProduction ? terser() : null,
    ],
  },
];
