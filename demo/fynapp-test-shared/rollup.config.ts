import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupFederationPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    // Mark the fake shared module as external so rollup doesn't try to bundle it
    external: ["nonexistent-shared-lib"],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      ...setupFederationPlugins({
        debugging: true,
        name: "fynapp-test-shared",
        exposes: {
          "./main": "./src/main.ts",
        },
        // Key test: consume-only shared module that doesn't exist
        // This should trigger SharedModuleNoProviderError at runtime
        shared: {
          "nonexistent-shared-lib": {
            import: false,  // consume-only, we don't provide it
            singleton: true,
            semver: "^1.0.0",
          },
        },
      }),
      newRollupPlugin(typescript)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
    ],
  }),
];
