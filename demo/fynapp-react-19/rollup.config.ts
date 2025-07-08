import { nodeResolve } from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";
import replace from "@rollup/plugin-replace";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  fynappEntryFilename,
  fynmeshShareScope,
  setupMinifyPlugins,
} from "create-fynapp";

export default [
  {
    input: [
      "src/index.ts",
      // this is the filename from federation plugin config.
      fynappEntryFilename,
    ],
    output: [
      {
        dir: "dist",
        format: "system",
        sourcemap: true,
      },
    ],
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
      newRollupPlugin(typescript)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      newRollupPlugin(federation)({
        name: "fynapp-react-lib",
        // this filename must be in the input config
        filename: fynappEntryFilename,
        shareScope: fynmeshShareScope,
        exposes: {},
        shared: {
          "esm-react": {
            singleton: true,
            requiredVersion: "^19.0.0",
          },
          "esm-react-dom": {
            singleton: true,
            requiredVersion: "^19.0.0",
          },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  },
];
