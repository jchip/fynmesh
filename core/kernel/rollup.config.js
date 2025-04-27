const typescript = require("@rollup/plugin-typescript");
const terser = require("@rollup/plugin-terser");
const resolve = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");

module.exports = {
  input: "src/main.ts",
  output: [
    {
      file: "dist/fynmesh-kernel.js",
      format: "iife",
      name: "FynMeshKernel",
      sourcemap: true,
    },
    {
      file: "dist/fynmesh-kernel.min.js",
      format: "iife",
      name: "FynMeshKernel",
      sourcemap: true,
      plugins: [terser()],
    },
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
    }),
  ],
};
