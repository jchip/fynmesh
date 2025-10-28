import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import alias from "@rollup/plugin-alias";
import babel from "@rollup/plugin-babel";
import postcss from "rollup-plugin-postcss";
import json from "@rollup/plugin-json";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupMinifyPlugins,
  setupFederationPlugins,
} from "create-fynapp";

export default [
  {
    input: [fynappDummyEntryName, fynappEntryFilename],
    output: [
      {
        dir: "dist",
        format: "system",
        sourcemap: true,
      },
    ],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(babel)({
        babelHelpers: "bundled",
        presets: ["@babel/preset-env"],
        plugins: [
          [
            "@babel/plugin-transform-react-jsx",
            {
              pragma: "h",
              pragmaFrag: "Fragment",
            },
          ],
        ],
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      }),
      newRollupPlugin(postcss)(),
      newRollupPlugin(resolve)({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      }),
      newRollupPlugin(commonjs)({ transformMixedEsModules: true }),
      newRollupPlugin(json)(),
      ...setupFederationPlugins({
        name: "fynapp-5-preact",
        exposes: {
          "./main": "./src/main.js",
        },
        shared: {
          preact: {
            singleton: true,
            requiredVersion: "^10.18.1",
          },
        },
      }),
      newRollupPlugin(alias)({
        entries: [
          // Ensure we use Preact in its native form without React compatibility
          { find: "react", replacement: "preact/hooks" },
          { find: "react-dom", replacement: "preact" },
        ],
      }),
      ...setupMinifyPlugins(),
    ].filter(Boolean),
  },
];
