import { nodeResolve } from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";
import replace from "@rollup/plugin-replace";
import { terser } from "rollup-plugin-terser";

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

export default [
  {
    input: [
      "src/index.ts",
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
      nodeResolve({
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        mainFields: ["module", "main"],
        preferBuiltins: false,
        browser: true,
        exportConditions: [env, "default"],
      }),
      replace({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
      }),
      // commonjs({ transformMixedEsModules: true }),
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      isProduction ? terser() : null,
      federation({
        name: "fynapp-react-lib",
        // this filename must be in the input config
        filename: "fynapp-entry.js",
        shareScope: "fynmesh",
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
    ],
  },
];
