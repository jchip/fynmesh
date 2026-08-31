import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import esbuild from "rollup-plugin-esbuild";

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
      esbuild({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
      }),
    ],
    external: ["react", "react-dom"],
  },
];
