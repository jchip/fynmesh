import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
// import alias from "@rollup/plugin-alias";
import markoPlugin from "@marko/rollup";
import json from "@rollup/plugin-json";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupMinifyPlugins,
  setupFederationPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(markoPlugin.browser)(),
      newRollupPlugin(resolve)({
        browser: true,
        exportConditions: [env],
        extensions: [".js", ".marko"],
      }),
      newRollupPlugin(commonjs)({
        transformMixedEsModules: true,
        extensions: [".js", ".marko"],
      }),
      newRollupPlugin(json)(),
      ...setupFederationPlugins({
        name: "fynapp-3-marko",
        exposes: {
          "./main": "./src/main.js",
        },
        /*
         * Deliberately unprovided. Nothing in the demo provides `marko`, and
         * nothing should: this is the negative case for share-not-provided
         * detection, and the shell's federation inspector reporting
         * `share-not-provided: marko@5.37.31` on every load is the demo
         * working. The app still renders, from its own bundled copy.
         *
         * DO NOT "fix" this by deleting the block or by adding a marko provider
         * FynApp. Every other single-framework app here (vue, preact, solid,
         * svelte) provides its framework and emits a `_mf-share-surface_*`
         * chunk to do it, so marko declaring one with no surface behind it
         * looks like an oversight. It is not, and there is no provider to add:
         * Marko's compiler bundles the runtime into each app and tree-shakes it
         * per component set, so there is no single lib to expose or to
         * singleton onto. That is exactly what makes it a better subject than
         * fynapp-test-shared's synthetic `nonexistent-shared-lib` -- a real
         * package that genuinely cannot be shared.
         */
        shared: {
          marko: {
            singleton: true,
            semver: "^5.37.31",
          },
        },
      }),
      // newRollupPlugin(alias)({
      //   entries: {
      //     // If needed for aliasing
      //   },
      // }),
      ...setupMinifyPlugins(),
    ].filter(Boolean),
  }),
];
