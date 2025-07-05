import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "src/index.ts",
  output: [
    {
      file: "dist/fynmesh-kernel.js",
      format: "iife",
      name: "FynMeshKernel",
      sourcemap: true,
      inlineDynamicImports: true,
    },
    {
      file: "dist/fynmesh-kernel.min.js",
      format: "iife",
      name: "FynMeshKernel",
      sourcemap: true,
      inlineDynamicImports: true,
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
