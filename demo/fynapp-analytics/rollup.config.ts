import { nodeResolve } from "@rollup/plugin-node-resolve";

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
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig, type Plugin } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    external: ["esm-react", "esm-react-dom", "analytics-core"],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(nodeResolve)({
        exportConditions: [env],
        extensions: [".mjs", ".js", ".json", ".ts", ".tsx"],
        browser: true,
      }),
      ...setupFederationPlugins({
        name: "fynapp-analytics",
        shareScope: fynmeshShareScope,
        exposes: {
          "./main": "./src/main.ts",
          "./component": "./src/component.tsx",
          "./header": "./src/header.tsx",
          "./toolbar": "./src/toolbar.tsx",
          "./filters": "./src/filters.tsx",
          "./date-range": "./src/date-range.tsx",
          "./kpi-tile": "./src/kpi-tile.tsx",
          "./format-badge": "./src/format-badge.tsx",
          "./empty-state": "./src/empty-state.tsx",
          "./perf-panel": "./src/perf-panel.tsx",
        },
        shared: {
          "esm-react": {
            import: false,
            singleton: false,
            semver: "^19.0.0",
          },
          "esm-react-dom": {
            import: false,
            singleton: false,
            semver: "^19.0.0",
          },
          "analytics-core": {
            import: false,
            singleton: true,
            semver: "^1.0.0",
          },
        },
      }),
      ...setupReactAliasPlugins(),
      ...setupTypeScriptPlugins(),
      ...setupMinifyPlugins(),
    ].filter(Boolean) as Plugin[],
  }),
];
