import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default [
  {
    input: "src/browser.ts",
    output: [
      {
        file: "dist/fynmesh-browser-kernel.dev.js",
        format: "iife",
        // name: "FynMeshKernel",
        sourcemap: true,
        inlineDynamicImports: true,
      },
      {
        file: "dist/fynmesh-browser-kernel.min.js",
        format: "iife",
        // name: "FynMeshKernel",
        sourcemap: true,
        inlineDynamicImports: true,
        plugins: [terser()],
      },
    ],
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
  {
    input: "src/node.ts",
    output: [
      {
        file: "dist/fynmesh-node-kernel.js",
        format: "esm",
        sourcemap: true,
        inlineDynamicImports: true,
      },
    ],
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
];
