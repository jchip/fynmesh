import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import replace from "@rollup/plugin-replace";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappEntryFilename,
  setupMinifyPlugins,
  setupFederationPlugins,
  fynmeshShareScope,
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
      newRollupPlugin(typescript)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      ...setupFederationPlugins({
        name: "fynapp-ag-grid-lib",
        shareScope: fynmeshShareScope,
        exposes: {},
        shared: {
          "esm-ag-grid": {
            singleton: true,
            semver: "^33.0.0",
          },
          "esm-ag-grid-react": {
            singleton: true,
            semver: "^33.0.0",
            requiredVersion: {
              // AG Grid React 33.x was built with React 18 JSX
              "esm-react": "^18.0.0",
              "esm-react-dom": "^18.0.0",
              "esm-ag-grid": "^33.0.0",
            },
          },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
