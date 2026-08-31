import resolve from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import postcss from "rollup-plugin-postcss";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  isProduction,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupMinifyPlugins,
  setupReactAliasPlugins,
  setupReactFederationPlugins,
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [
      fynappDummyEntryName,
      // this is the filename from federation plugin config.
      fynappEntryFilename,
    ],
    ...setupFynAppOutputConfig(),
    external: ["esm-react", "esm-react-dom"],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
        extensions: [".mjs", ".js", ".json", ".node", ".ts", ".tsx"],
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
          "./main": "./src/main.tsx",
        },
        shared: {},
        debugging: true,
      }),
      ...setupTypeScriptPlugins(),
      ...setupReactAliasPlugins(),
      ...setupMinifyPlugins(),
    ],
  }),
];
