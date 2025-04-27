import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

export default [
  {
    input: ["src/index.ts"],
    output: [
      {
        dir: "dist",
        format: "system",
        sourcemap: true,
      },
    ],
    plugins: [
      resolve(),
      commonjs({ transformMixedEsModules: true }),
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
    ],
    external: ["react", "react-dom"],
  },
];
