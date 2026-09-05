import esbuild from "rollup-plugin-esbuild";
import resolve from "@rollup/plugin-node-resolve";

/*
 * Two outputs from one source tree, with opposite dependency policies.
 *
 *   federation-inspector.js  the drop-in. IIFE, self-mounting, and Preact
 *                            bundled INTO it -- it has to be one file you can
 *                            put next to systemjs on any page, with nothing to
 *                            resolve at runtime.
 *   index.js                 the library. ESM, no side effects on import, and
 *                            Preact left external so a consumer (an extension
 *                            panel, an app embedding the UI) dedupes it
 *                            against its own copy instead of carrying a second.
 */

const jsx = {
  jsx: "automatic",
  jsxImportSource: "preact",
  target: "es2020",
};

const PREACT = [/^preact(\/.*)?$/, /^@preact\/signals/];

export default [
  {
    input: "src/standalone.ts",
    output: {
      file: "dist/federation-inspector.js",
      format: "iife",
      // named, so `FederationInspector.mount()` works even for a consumer who
      // loads the bundle but wants to mount it themselves. The module also
      // assigns the same object to globalThis, which covers the ordinary case.
      name: "FederationInspector",
      extend: true,
      sourcemap: true,
      inlineDynamicImports: true,
    },
    plugins: [resolve({ browser: true }), esbuild(jsx)],
  },
  {
    input: "src/index.ts",
    external: PREACT,
    output: {
      file: "dist/index.js",
      format: "es",
      sourcemap: true,
      inlineDynamicImports: true,
    },
    plugins: [esbuild(jsx)],
  },
];
