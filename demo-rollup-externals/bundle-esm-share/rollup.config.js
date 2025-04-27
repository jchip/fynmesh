import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import alias from "@rollup/plugin-alias";

const format = "esm";

export default [
  // Application bundle
  {
    input: ["src/use-as-external.js"],
    output: {
      dir: "dist-2",
      format,
      sourcemap: true,
      exports: "named",
      preserveModules: false,
    },
    external: ["esm-react", "esm-pkg", "esm-react-dom"],
    plugins: [
      replace({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
      }),
      nodeResolve({
        extensions: [".js", ".jsx"],
        browser: true,
      }),
      commonjs({
        include: /node_modules/,
        transformMixedEsModules: true,
        defaultIsModule: true,
      }),
      alias({
        entries: {
          react: "esm-react",
          "react-dom": "esm-react-dom",
          "esm-pkg-test": "esm-pkg",
        },
      }),
    ],
  },
  // shared bundle
  {
    input: ["src/share.js", "esm-react", "esm-pkg", "esm-react-dom"],
    output: {
      dir: "dist",
      format,
      sourcemap: true,
      exports: "named",
      preserveModules: false,
    },
    plugins: [
      replace({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
      }),
      nodeResolve({
        extensions: [".js", ".jsx", ".mjs", ".ts", ".tsx"],
        browser: true,
      }),
      commonjs({
        include: /node_modules/,
        // transformMixedEsModules: true,
        // defaultIsModule: true,
      }),
      alias({
        entries: {
          react: "esm-react",
          "react-dom": "esm-react-dom",
          "esm-pkg-test": "esm-pkg",
        },
      }),
    ],
  },
];
