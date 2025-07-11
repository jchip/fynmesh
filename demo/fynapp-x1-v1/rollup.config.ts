import resolve from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";
// import alias from "@rollup/plugin-alias";
// import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  isProduction,
  fynappEntryFilename,
  setupMinifyPlugins,
  fynmeshShareScope,
  setupReactAliasPlugins,
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
    external: ["esm-react", "esm-react-dom"],
    plugins: [
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      // commonjs({ transformMixedEsModules: true }),
      newRollupPlugin(postcss)({
        minimize: isProduction,
        inject: true,
        extract: false,
      }),
      newRollupPlugin(federation)({
        name: "fynapp-x1",
        shareScope: fynmeshShareScope,
        filename: fynappEntryFilename,
        exposes: {
          "./main": "./src/main.tsx",
          "./styles.js": "./src/styles.css",
        },
        shared: {
          "esm-react": {
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
  },
];
