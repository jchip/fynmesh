import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import alias from "@rollup/plugin-alias";
import { terser } from "rollup-plugin-terser";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";
import fs from "fs";
import path from "path";

const production = !process.env.ROLLUP_WATCH;

// Simple plugin to copy public directory to dist
const copyPublicDir = () => {
  return {
    name: "copy-public",
    buildStart() {
      if (!fs.existsSync("dist")) {
        fs.mkdirSync("dist");
      }

      const publicFiles = fs.readdirSync("public");
      publicFiles.forEach((file) => {
        const content = fs.readFileSync(path.join("public", file));
        fs.writeFileSync(path.join("dist", file), content);
      });
    },
  };
};

export default {
  input: "src/index.tsx",
  output: {
    file: "dist/bundle.js",
    format: "iife",
    sourcemap: !production,
  },
  plugins: [
    // Copy public directory to dist
    copyPublicDir(),

    // Enable importing from node_modules
    resolve({
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      browser: true,
      exportConditions: [production ? "production" : "development"],
    }),

    // Convert CommonJS modules to ES6
    commonjs({
      include: /node_modules/,
    }),

    // Replace process.env.NODE_ENV with the appropriate value
    replace({
      preventAssignment: true,
      values: {
        "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
      },
    }),

    // TypeScript compilation
    typescript({
      tsconfig: "./tsconfig.json",
      sourceMap: !production,
      inlineSources: !production,
    }),

    alias({
      entries: {
        react: "esm-react",
        // "react-dom": "esm-react-dom",
        "react-dom/client": "esm-react-dom",
      },
    }),

    // Minify for production
    production && terser(),

    // Development server
    !production &&
      serve({
        open: true,
        contentBase: ["dist"],
        host: "localhost",
        port: 3000,
      }),

    // Live reload during development
    !production &&
      livereload({
        watch: "dist",
      }),
  ],
  watch: {
    clearScreen: false,
  },
};
