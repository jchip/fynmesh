import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";

const format = "esm";

const createConfig = (env = "production") => {
  return {
    input: ["src/index.js"],
    output: {
      file: `dist/ag-grid-enterprise.${env}.js`,
      format,
      sourcemap: true,
      exports: "named",
      preserveModules: false,
    },
    // Community must come from the shared esm-ag-grid, never bundled here:
    // a second copy would keep its own module registry.
    external: ["esm-ag-grid"],
    plugins: [
      alias({
        entries: [{ find: /^ag-grid-community$/, replacement: "esm-ag-grid" }],
      }),
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
