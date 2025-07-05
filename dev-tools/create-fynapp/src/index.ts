// Export core functionality for programmatic use
export { generateApp } from "./generator.js";
export { promptForMissingInfo } from "./prompts.js";
export { ConfigManager } from "./config.js";
export { fileExists } from "./utils.js";
export { buildFynApp } from "./builder.js";
export { updateDependencies } from "./updater.js";

// Export configuration types and utilities
export type { FynAppConfigOptions } from "./config-ast.js";
export { RollupConfigManager } from "./config-ast.js";

import process from "node:process";
import virtual from "@rollup/plugin-virtual";
import noEmit from "rollup-plugin-no-emit";
import alias from "@rollup/plugin-alias";
import { newRollupPlugin } from "rollup-wrap-plugin";
import terser from "@rollup/plugin-terser";
import federation from "rollup-plugin-federation";
import type { FederationPluginOptions } from "rollup-plugin-federation";

export const env = process.env.NODE_ENV || "development";
export const isProduction = env === "production";

/**
 * Rollup needs at least one entry to get the build started.  We use a virtual entry
 * to satisfy this requirement.  The dummy entry is not used.
 */
export const fynappDummyEntryName = "fynapp-dummy-entry";
/**
 * The filename of the entry point for the fynapp's module federation bundle.
 * This is the file that will be used by the fynmesh to load the fynapp.
 */
export const fynappEntryFilename = "fynapp-entry.js";
/**
 * The module federation share scope for the fynmesh.  This is the scope that will be used to share
 * modules between the fynmesh and the fynapps.
 */
export const fynmeshShareScope = "fynmesh";

/**
 * Setup plugins to create a dummy entry for the fynapp.
 * @returns Rollup plugins to create a dummy entry for the fynapp.
 */
export function setupDummyEntryPlugins() {
  return [
    newRollupPlugin(virtual)({
      [fynappDummyEntryName]: "// fynapp dummy entry\nconsole.log('fynapp dummy entry');",
    }),
    newRollupPlugin(noEmit)({
      match: (fileName) => fileName.includes(fynappDummyEntryName),
    }),
  ];
}

/**
 * Setup plugins to alias React and React DOM to the esm-react and esm-react-dom packages.
 * @returns Rollup plugins to alias React and React DOM to the esm-react and esm-react-dom packages.
 */
export function setupReactAliasPlugins() {
  return [
    newRollupPlugin(alias)({
      entries: [
        { find: "react", replacement: "esm-react" },
        { find: "react-dom/client", replacement: "esm-react-dom" },
        { find: "react-dom", replacement: "esm-react-dom" },
      ],
    }),
  ];
}

/**
 * Setup plugins to minify the fynapp's bundle.
 * @returns Rollup plugins to minify the fynapp's bundle.
 */
export function setupMinifyPlugins(config = {}) {
  return isProduction ? [newRollupPlugin(terser)(config)] : [];
}

/**
 * Setup plugins to configure the federation plugin.
 * @param config - The configuration for the federation plugin.
 * @returns Rollup plugins to configure the federation plugin.
 */
export function setupReactFederationPlugins(config: Partial<FederationPluginOptions> = {}) {
  return [
    newRollupPlugin(federation)({
      name: "fynapp-sample-1",
      shareScope: fynmeshShareScope,
      filename: fynappEntryFilename,
      ...config,
      exposes: {
        "./main": "./src/main.ts",
        ...config.exposes,
      },
      shared: {
        "esm-react": {
          import: false,
          singleton: false,
          requiredVersion: "^19.0.0",
        },
        "esm-react-dom": {
          import: false,
          singleton: false,
          requiredVersion: "^19.0.0",
        },
        ...config.shared,
      },
    }),
  ];
}
