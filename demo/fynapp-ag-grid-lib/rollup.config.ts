import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappEntryFilename,
  setupMinifyPlugins,
  setupFederationPlugins,
  fynmeshShareScope,
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [
      "src/index.ts",
      fynappEntryFilename,
    ],
    ...setupFynAppOutputConfig(),
    // esm-react/esm-react-dom are external - provided by fynapp-react-lib
    external: ["esm-react", "esm-react-dom"],
    plugins: [
      newRollupPlugin(nodeResolve)({
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        mainFields: ["module", "main"],
        preferBuiltins: false,
        browser: true,
        exportConditions: [env, "default"],
      }),
      newRollupPlugin(replace)({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
      }),
      ...setupTypeScriptPlugins(),
      ...setupFederationPlugins({
        name: "fynapp-ag-grid-lib",
        shareScope: fynmeshShareScope,
        exposes: {},
        shared: {
          // Declare React as consumed shared modules so the AG Grid React
          // wrapper (which imports esm-react/esm-react-dom transitively) binds
          // to React 19 — the same version the consuming fynapp uses. Without
          // these, the container resolves React with no semver constraint and
          // defaults to React 18, producing mixed React copies (error #525).
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
          "esm-ag-grid": {
            singleton: true,
            semver: "^33.0.0",
          },
          "esm-ag-grid-react": {
            singleton: true,
            semver: "^33.0.0",
            requiredVersion: {
              // AG Grid React 33.x supports React 19; bind the wrapper to the
              // same React 19 the consuming fynapp uses to avoid mixed React
              // copies (React error #525 when elements come from React 18).
              "esm-react": "^19.0.0",
              "esm-react-dom": "^19.0.0",
              "esm-ag-grid": "^33.0.0",
            },
          },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
