import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss";
import alias from "@rollup/plugin-alias";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupReactAliasPlugins,
  setupMinifyPlugins,
  setupFederationPlugins,
  fynmeshShareScope,
} from "create-fynapp";
import { defineConfig, type Plugin } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    external: ["esm-react", "esm-react-dom", "esm-ag-grid", "esm-ag-grid-react"],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
        browser: true,
      }),
      newRollupPlugin(commonjs)(),
      newRollupPlugin(postcss)(),
      // Use setupFederationPlugins directly to configure React 18
      // AG Grid React 33.x was built with React 18 JSX runtime
      ...setupFederationPlugins({
        name: "fynapp-ag-grid",
        shareScope: fynmeshShareScope,
        exposes: {
          "./component": "./src/component.ts",
        },
        shared: {
          // React 18 for AG Grid compatibility
          "esm-react": {
            import: false,
            singleton: false,
            semver: "^18.0.0",
          },
          "esm-react-dom": {
            import: false,
            singleton: false,
            semver: "^18.0.0",
          },
          "esm-ag-grid": {
            import: false,
            singleton: true,
            semver: "^33.0.0",
          },
          "esm-ag-grid-react": {
            import: false,
            singleton: true,
            semver: "^33.0.0",
            requiredVersion: {
              "esm-react": "^18.0.0",
              "esm-ag-grid": "^33.0.0",
            },
          },
        },
        // shared-providers to declare which libraries provide the shared modules
        sharedProviders: {
          "fynapp-react-lib": {
            semver: "^18.0.0",
            provides: ["esm-react", "esm-react-dom"],
          },
          "fynapp-ag-grid-lib": {
            semver: "^33.3.2",
            provides: ["esm-ag-grid", "esm-ag-grid-react"],
          },
        },
      }),
      ...setupReactAliasPlugins(),
      // Alias AG Grid modules to ESM wrappers
      newRollupPlugin(alias)({
        entries: [
          { find: "ag-grid-community", replacement: "esm-ag-grid" },
          { find: "ag-grid-react", replacement: "esm-ag-grid-react" },
        ],
      }),
      newRollupPlugin(typescript)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      ...setupMinifyPlugins(),
    ].filter(Boolean) as Plugin[],
  }),
];
