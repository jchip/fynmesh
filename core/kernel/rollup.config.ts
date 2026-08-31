import esbuild from "rollup-plugin-esbuild";
import terser from "@rollup/plugin-terser";
import { reservedNames } from "./build/reserved-names.mjs";

export default [
  {
    input: "src/browser-dev.ts",
    output: {
      file: "dist/fynmesh-browser-kernel.dev.js",
      format: "iife",
      sourcemap: true,
      inlineDynamicImports: true,
    },
    plugins: [
      esbuild({
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
  {
    input: "src/browser.ts",
    output: {
      file: "dist/fynmesh-browser-kernel.min.js",
      format: "iife",
      sourcemap: true,
      inlineDynamicImports: true,
      plugins: [
        terser({
          compress: {
            // All console output, not just debug/log. The diagnostics still
            // exist — dist/fynmesh-browser-kernel.dev.js is built from the same
            // sources with no terser at all, and the demo templates serve it
            // unless NODE_ENV=production. Errors keep their codes and context
            // objects and still reach telemetry transports, so nothing
            // programmatic depends on the prose that goes away here.
            drop_console: true,
            passes: 4,
            // `this`-free function expressions become arrows, and function
            // properties become shorthand methods. Both are safe here: the
            // bundle targets ES2022 and never reads `.prototype` or
            // `arguments` off its own functions.
            unsafe_arrows: true,
            unsafe_methods: true,
            unsafe_undefined: true,
          },
          mangle: {
            // The bundle is an IIFE with a single global assignment, so nothing
            // at the top level is reachable by name from outside.
            toplevel: true,
            properties: {
              // Everything crossing the boundary is held back; see
              // build/reserved-names.ts for how the list is derived.
              reserved: reservedNames(),
              // `manifest["import-exposed"]` and friends: quoting a key is the
              // escape hatch for names the declarations do not describe.
              keep_quoted: true,
            },
          },
        }),
      ],
    },
    plugins: [
      esbuild({
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
      esbuild({
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.js",
        format: "esm",
        sourcemap: true,
        inlineDynamicImports: true,
      },
    ],
    plugins: [
      esbuild({
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
];
