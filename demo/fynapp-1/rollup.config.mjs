import resolve from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

export default [
  {
    input: [
      "src/main.ts",
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
      federation({
        name: "fynapp-1",
        shareScope: "fynmesh",
        // this filename must be in the input config array
        filename: "fynapp-entry.js",
        exposes: {
          "./hello": "./src/hello.ts",
          "./getInfo": "./src/getInfo.ts",
          "./main": "./src/main.ts",
          "./config": "./src/config.ts",
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
        debugging: true,
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
