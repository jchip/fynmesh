import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import federation from "rollup-plugin-federation";
// import alias from "@rollup/plugin-alias";
import replace from "@rollup/plugin-replace";
import vue from "rollup-plugin-vue";
import postcss from "rollup-plugin-postcss";
import json from "@rollup/plugin-json";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  isProduction,
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
      newRollupPlugin(vue)({
        // @ts-ignore - css is not a valid option for vue plugin but handled by postcss plugin
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
      // newRollupPlugin(alias)({
      //   entries: {
      //     // If needed for aliasing
      //   },
      // }),
      ...setupMinifyPlugins(),
    ].filter(Boolean),
  },
];
