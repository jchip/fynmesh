import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import postcss from "rollup-plugin-postcss";
import json from "@rollup/plugin-json";

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

export default [
  {
    input: [
      "src/main.js",
      // this is the filename from federation plugin config.
      "fynapp-entry.js",
    ],
    output: [
      {
        dir: "dist",
        format: "system",
        sourcemap: true,
      },
    ],
    plugins: [
      babel({
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
      postcss(),
      resolve({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      }),
      commonjs({ transformMixedEsModules: true }),
      json(),
      federation({
        name: "fynapp-5-preact",
        shareScope: "fynmesh",
        // this filename must be in the input config array
        filename: "fynapp-entry.js",
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
      alias({
        entries: [
          // Ensure we use Preact in its native form without React compatibility
          { find: "react", replacement: "preact/hooks" },
          { find: "react-dom", replacement: "preact" },
        ],
      }),
      isProduction ? terser() : null,
    ],
  },
];
