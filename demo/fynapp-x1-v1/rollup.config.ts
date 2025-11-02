import resolve from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
// import alias from "@rollup/plugin-alias";
// import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";
import { newRollupPlugin } from "rollup-wrap-plugin";

import {
  env,
  isProduction,
  setupFynAppOutputConfig,
  fynappEntryFilename,
  setupMinifyPlugins,
  setupReactAliasPlugins,
  setupDummyEntryPlugins,
  setupFederationPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [
      fynappEntryFilename,
      // this is the filename from federation plugin config.
      fynappEntryFilename,
    ],
    ...setupFynAppOutputConfig(),
    external: ["esm-react", "esm-react-dom"],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      // commonjs({ transformMixedEsModules: true }),
      newRollupPlugin(postcss)({
        minimize: isProduction,
        inject: true,
        extract: false,
      }),
      ...setupFederationPlugins({
        name: "fynapp-x1",
        exposes: {
          "./main": "./src/main.tsx",
        },
        shared: {
          "esm-react": {
            import: false,
            singleton: true,
            requiredVersion: "^18.3.0",
          },
          "esm-react-dom": {
            import: false,
            singleton: true,
            requiredVersion: "^18.3.0",
          },
        },
        debugging: true,
      }),
      newRollupPlugin(typescript)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      ...setupReactAliasPlugins(),
      ...setupMinifyPlugins(),
    ],
  }),
];
