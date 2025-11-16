import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
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
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      // commonjs({ transformMixedEsModules: true }),
      ...setupFederationPlugins({
        name: "fynapp-2-react18",
        exposes: {
          "./main": "./src/main.ts",
          "./App": "./src/App.tsx",
          "./component": "./src/component.ts",
        },
        shared: {
          "esm-react": {
            singleton: true,
            semver: "^18.0.0",
          },
          "esm-react-dom": {
            singleton: true,
            semver: "^18.0.0",
          },
        },
      }),
      ...setupReactAliasPlugins(),
      newRollupPlugin(typescript)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      ...setupMinifyPlugins(),
    ].filter(Boolean),
  }),
];
