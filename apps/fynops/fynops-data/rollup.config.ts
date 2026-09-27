import { nodeResolve } from "@rollup/plugin-node-resolve";
import { readFileSync } from "node:fs";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappEntryFilename,
  setupMinifyPlugins,
  setupFederationPlugins,
  fynmeshShareScope,
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig, type Plugin } from "rollup";

const SQLITE_WASM = "node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm";

/**
 * Copy sqlite3.wasm into dist next to the worker. sqlite-wasm finds it with
 * `new URL("sqlite3.wasm", import.meta.url)`, and in a module worker that url
 * is the worker file, so the two must sit side by side.
 */
function emitSqliteWasm(): Plugin {
  return {
    name: "emit-sqlite-wasm",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sqlite3.wasm", source: readFileSync(SQLITE_WASM) });
    },
  };
}

export default [
  // The FynApp: shares fynops-data-core, the client every feature imports.
  defineConfig({
    input: ["src/index.ts", fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    plugins: [
      newRollupPlugin(nodeResolve)({
        extensions: [".js", ".ts"],
        mainFields: ["module", "main"],
        exportConditions: [env, "default"],
      }),
      ...setupTypeScriptPlugins(),
      ...setupFederationPlugins({
        name: "fynops-data",
        shareScope: fynmeshShareScope,
        exposes: {},
        shared: {
          "fynops-data-core": { singleton: true, semver: "^1.0.0" },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  }),
  // The SQLite worker. A worker cannot run SystemJS output, so it is its own
  // ES module build, with a fixed name the client resolves from import.meta.url.
  defineConfig({
    input: "src/worker.ts",
    output: { file: "dist/fynops-data-worker.js", format: "es", sourcemap: false },
    plugins: [
      newRollupPlugin(nodeResolve)({
        extensions: [".mjs", ".js", ".ts"],
        browser: true,
        exportConditions: ["browser", "import", "default"],
      }),
      ...setupTypeScriptPlugins(),
      emitSqliteWasm(),
      ...setupMinifyPlugins(),
    ],
  }),
];
