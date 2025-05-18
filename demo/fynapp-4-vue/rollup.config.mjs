import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import replace from "@rollup/plugin-replace";
import vue from "rollup-plugin-vue";
import postcss from "rollup-plugin-postcss";
import json from "@rollup/plugin-json";

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

export default [
  {
    input: [
      "src/main.js",
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
      vue({
        css: false, // Handled by postcss plugin
        template: {
          isProduction,
        },
      }),
      postcss(),
      replace({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: !isProduction,
      }),
      resolve({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".vue", ".ts"],
      }),
      commonjs({ transformMixedEsModules: true }),
      json(),
      federation({
        name: "fynapp-4-vue",
        shareScope: "fynmesh",
        // this filename must be in the input config array
        filename: "fynapp-entry.js",
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
      alias({
        entries: {
          // If needed for aliasing
        },
      }),
      isProduction ? terser() : null,
    ],
  },
];
