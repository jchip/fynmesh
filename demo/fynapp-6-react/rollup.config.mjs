import resolve from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";

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
    external: ["esm-react", "esm-react-dom"],
    plugins: [
      resolve({
        exportConditions: [env],
      }),
      // commonjs({ transformMixedEsModules: true }),
      postcss(),
      federation({
        name: "fynapp-6-react",
        shareScope: "fynmesh",
        // this filename must be in the input config array
        filename: "fynapp-entry.js",
        exposes: {
          "./hello": "./src/hello.ts",
          "./getInfo": "./src/getInfo.ts",
          "./bootstrap": "./src/bootstrap.ts",
          "./preload": "./src/preload.ts",
          "./App": "./src/App.tsx",
        },
        shared: {
          "esm-react": {
            import: false,
            singleton: false,
            requiredVersion: "^19.0.0",
          },
          "esm-react-dom": {
            import: false,
            singleton: false,
            requiredVersion: "^19.0.0",
          },
        },
      }),
      alias({
        entries: {
          react: "esm-react",
          "react-dom": "esm-react-dom",
          "react-dom/client": "esm-react-dom",
        },
      }),
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      isProduction ? terser() : null,
    ],
  },
];
