import esbuild from "rollup-plugin-esbuild";
import terser from "@rollup/plugin-terser";
import { reservedNames } from "./build/reserved-names.mjs";
import { shouldEmitSourceMap } from "./build/sourcemap-policy.mjs";

// Dev builds get maps, production builds do not -- see build/sourcemap-policy.mjs
// for why the comment left behind by a stripped map is the thing that matters.
const sourcemap = shouldEmitSourceMap();

const plugins = () => [
  esbuild({
    tsconfig: "./tsconfig.json",
  }),
];

const minify = () =>
  terser({
    compress: {
      // All console output, not just debug/log. The diagnostics still
      // exist — the .dev.js bundles are built from the same sources with no
      // terser at all, and the demo templates serve them unless
      // NODE_ENV=production. Errors keep their codes and context objects and
      // still reach telemetry transports, so nothing programmatic depends on
      // the prose that goes away here.
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
      // Each bundle is an IIFE with at most a single global assignment, so
      // nothing at the top level is reachable by name from outside.
      toplevel: true,
      properties: {
        // Everything crossing the boundary is held back; see
        // build/reserved-names.ts for how the list is derived. Every bundle
        // mangles on its own, so this is also what lets an add-on bundle and
        // the core bundle agree on the names they share.
        reserved: reservedNames(),
        // `manifest["import-exposed"]` and friends: quoting a key is the
        // escape hatch for names the declarations do not describe.
        keep_quoted: true,
      },
    },
  });

/** A browser IIFE bundle, unminified (`.dev.js`) or minified (`.min.js`). */
const browserBundle = (input: string, name: string, min: boolean) => ({
  input,
  output: {
    file: `dist/${name}.${min ? "min" : "dev"}.js`,
    format: "iife",
    sourcemap,
    inlineDynamicImports: true,
    ...(min && { plugins: [minify()] }),
  },
  plugins: plugins(),
});

const esmBundle = (input: string, file: string) => ({
  input,
  output: [
    {
      file,
      format: "esm",
      sourcemap,
      inlineDynamicImports: true,
    },
  ],
  plugins: plugins(),
});

/**
 * The core kernel and each add-on, as separately loadable bundles. Load core
 * first; each add-on installs itself into `globalThis.fynMeshKernel`.
 */
const split = [
  ["src/browser-core.ts", "fynmesh-kernel-core"],
  ["src/entries/addon-middleware.ts", "fynmesh-kernel-middleware"],
  ["src/entries/addon-bus.ts", "fynmesh-kernel-bus"],
  ["src/entries/addon-telemetry.ts", "fynmesh-kernel-telemetry"],
];

export default [
  // Core plus every add-on in one build; the dev one also has the overlay
  browserBundle("src/browser-dev.ts", "fynmesh-browser-kernel", false),
  browserBundle("src/browser.ts", "fynmesh-browser-kernel", true),
  ...split.flatMap(([input, name]) => [
    browserBundle(input, name, false),
    browserBundle(input, name, true),
  ]),
  // Dev only, like the overlay in the full dev bundle
  browserBundle("src/entries/addon-dev-overlay.ts", "fynmesh-kernel-dev-overlay", false),
  esmBundle("src/node.ts", "dist/fynmesh-node-kernel.js"),
  esmBundle("src/index.ts", "dist/index.js"),
];
