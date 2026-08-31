import { nodeResolve } from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappEntryFilename,
  setupMinifyPlugins,
  setupFederationPlugins,
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [
      "src/index.ts",
      // this is the filename from federation plugin config.
      fynappEntryFilename,
    ],
    ...setupFynAppOutputConfig(),
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
      // commonjs({ transformMixedEsModules: true }),
      ...setupTypeScriptPlugins(),
      ...setupFederationPlugins({
        name: "fynapp-react-lib",
        exposes: {},
        shared: {
          "esm-react": {
            singleton: true,
            semver: "^19.0.0",
          },
          "esm-react-dom": {
            singleton: true,
            semver: "^19.0.0",
          },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
