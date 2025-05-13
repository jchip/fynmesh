import { nodeResolve } from "@rollup/plugin-node-resolve";
import federation from "rollup-plugin-federation";
import replace from "@rollup/plugin-replace";
import { terser } from "rollup-plugin-terser";

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

export default [
  {
    input: [
      "src/index.js",
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
    preserveSymlinks: true,
    plugins: [
      nodeResolve({
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        mainFields: ["module", "main"],
        preferBuiltins: false,
        browser: true,
        exportConditions: [env],
        preserveSymlinks: true,
      }),
      replace({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
      }),
      isProduction ? terser() : null,
      federation({
        name: "fynapp-react-19",
        // this filename must be in the input config
        filename: "fynapp-entry.js",
        shareScope: "fynmesh",
        exposes: {},
        shared: {
          "esm-react": {
            singleton: true,
            requiredVersion: "^18.0.0",
          },
          "esm-react-dom": {
            singleton: true,
            requiredVersion: "^18.0.0",
          },
        },
      }),
    ],
  },
];
