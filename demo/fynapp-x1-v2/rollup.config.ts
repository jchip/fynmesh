import resolve from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  isProduction,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupMinifyPlugins,
  setupReactAliasPlugins,
  setupReactFederationPlugins,
} from "create-fynapp";

export default [
  {
    input: [
      fynappDummyEntryName,
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
      ...setupReactFederationPlugins({
        name: "fynapp-x1",
        exposes: {
          "./main": "./src/main.tsx"
        },
        shared: {
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
