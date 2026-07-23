import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
// import alias from "@rollup/plugin-alias";
import replace from "@rollup/plugin-replace";
import vue from "rollup-plugin-vue";
import postcss from "rollup-plugin-postcss";
import json from "@rollup/plugin-json";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  isProduction,
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
      ...setupFederationPlugins({
        name: "fynapp-4-vue",
        exposes: {
          "./main": "./src/main.js",
        },
        shared: {
          vue: {
            singleton: true,
            semver: "^3.3.4",
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
