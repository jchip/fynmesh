import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";

const format = "esm";

const createConfig = (env = "production") => {
  return {
    input: ["src/client.js"],
    output: {
      file: `dist/react-dom-esm-18-client.${env}.js`,
      format,
      sourcemap: true,
      exports: "named",
      preserveModules: false,
    },
    external: ["esm-react"],
    plugins: [
      replace({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
      }),
      nodeResolve({
        extensions: [".js", ".jsx"],
        browser: true,
      }),
      alias({
        entries: [{ find: "react", replacement: "esm-react" }],
      }),
      commonjs({
        include: /node_modules/,
        transformMixedEsModules: true,
        defaultIsModule: true,
      }),
      env === "production" ? terser() : null,
    ],
  };
};

export default [
  // production build
  createConfig("production"),
  // development build
  createConfig("development"),
];
