import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";

const format = "esm";

const createConfig = (env = "production") => {
  return {
    input: ["src/index.js"],
    output: {
      file: `dist/ag-grid.${env}.js`,
      format,
      sourcemap: true,
      exports: "named",
      preserveModules: false,
    },
    plugins: [
      replace({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
      }),
      nodeResolve({
        extensions: [".js", ".mjs"],
        browser: true,
        exportConditions: [env === "production" ? "production" : "development"],
      }),
      commonjs({
        include: /node_modules/,
        transformMixedEsModules: true,
      }),
      env === "production" ? terser() : null,
    ].filter(Boolean),
  };
};

export default [
  createConfig("production"),
  createConfig("development"),
];
