import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { newRollupPlugin } from "rollup-wrap-plugin";
import { defineConfig, type RollupOptions, type Plugin } from "rollup";
import type { FederationPluginOptions } from "rollup-plugin-federation";

import {
  env,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupFynAppOutputConfig,
  setupDummyEntryPlugins,
  setupReactFederationPlugins,
  setupFederationPlugins,
  setupReactAliasPlugins,
  setupMinifyPlugins,
} from "./index.ts";

/**
 * Options for creating a FynApp rollup config via the factory.
 */
export interface FynAppRollupConfigOptions {
  /** The name of the FynApp (used in federation plugin) */
  name: string;
  /** Framework type - determines federation style and default plugins */
  framework?: "react" | "react18" | "solid" | "vue" | "marko" | "preact" | "svelte" | "vanilla";
  /** Module federation exposes map */
  exposes?: Record<string, string>;
  /** Module federation shared dependencies */
  shared?: Record<string, any>;
  /** External modules to exclude from the bundle */
  external?: string[];
  /** TypeScript plugin options, or true for defaults. Pass false/undefined to skip. */
  typescript?: boolean | Record<string, any>;
  /** Entry header/footer for federation entry code generation */
  entry?: { header?: string; footer?: string };
  /** Enable debugging in federation plugin */
  debugging?: boolean;
  /** Additional plugins to include before federation plugins */
  extraPlugins?: Plugin[];
  /** Additional plugins to include after all other plugins (before minify) */
  extraPluginsAfter?: Plugin[];
  /** Custom resolve plugin options */
  resolve?: Record<string, any>;
  /** Additional federation plugin options (merged into federation config) */
  federationOptions?: Partial<FederationPluginOptions>;
}

/**
 * Creates a standard FynApp rollup configuration.
 *
 * Handles all the boilerplate common to FynApp rollup configs:
 * - Standard input (dummy entry + fynapp entry)
 * - Standard output (dist/, systemjs format)
 * - Dummy entry plugins
 * - Node resolve plugin
 * - Federation plugins (React or vanilla variant)
 * - React alias plugins (for React framework)
 * - TypeScript plugin (when typescript option is set)
 * - Minify plugins (in production)
 *
 * @example
 * ```ts
 * // Simple React FynApp
 * import { createFynAppRollupConfig } from "create-fynapp";
 *
 * export default createFynAppRollupConfig({
 *   name: "fynapp-sidebar",
 *   framework: "react",
 *   typescript: true,
 *   exposes: { "./component": "./src/component.ts" },
 * });
 * ```
 *
 * @example
 * ```ts
 * // React FynApp with postcss
 * import { createFynAppRollupConfig } from "create-fynapp";
 * import postcss from "rollup-plugin-postcss";
 * import { newRollupPlugin } from "rollup-wrap-plugin";
 *
 * export default createFynAppRollupConfig({
 *   name: "fynapp-notes",
 *   framework: "react",
 *   typescript: true,
 *   extraPlugins: [newRollupPlugin(postcss)({ inject: true, extract: false })],
 *   exposes: { "./main": "./src/main.ts" },
 * });
 * ```
 */
export function createFynAppRollupConfig(options: FynAppRollupConfigOptions): RollupOptions[] {
  const {
    name,
    framework = "react",
    exposes = {},
    shared = {},
    external,
    entry,
    debugging,
    extraPlugins = [],
    extraPluginsAfter = [],
    federationOptions = {},
  } = options;

  const isReactFramework = framework === "react" || framework === "react18";

  // Determine externals
  const resolvedExternal = external ?? (isReactFramework ? ["esm-react", "esm-react-dom"] : []);

  // Build resolve plugin options
  const resolveOptions: Record<string, any> = {
    exportConditions: [env],
    ...options.resolve,
  };

  // Build plugins array
  const plugins: Plugin[] = [
    // 1. Dummy entry plugins
    ...setupDummyEntryPlugins(),

    // 2. Node resolve
    newRollupPlugin(nodeResolve)(resolveOptions),

    // 3. Extra plugins (postcss, babel, framework-specific plugins go here)
    ...extraPlugins,

    // 4. Federation plugins
    ...(isReactFramework
      ? setupReactFederationPlugins({
          name,
          exposes,
          shared,
          entry,
          debugging,
          ...federationOptions,
        })
      : setupFederationPlugins({
          name,
          exposes,
          shared,
          entry,
          debugging,
          ...federationOptions,
        })),

    // 5. React alias plugins (only for React framework)
    ...(isReactFramework ? setupReactAliasPlugins() : []),

    // 6. Extra plugins after federation (alias overrides, etc.)
    ...extraPluginsAfter,

    // 7. TypeScript plugin (if configured)
    ...(options.typescript
      ? [
          newRollupPlugin(typescript)(
            typeof options.typescript === "object"
              ? options.typescript
              : {
                  tsconfig: "./tsconfig.json",
                  sourceMap: true,
                  inlineSources: true,
                },
          ),
        ]
      : []),

    // 8. Minify plugins
    ...setupMinifyPlugins(),
  ];

  return [
    defineConfig({
      input: [fynappDummyEntryName, fynappEntryFilename],
      ...setupFynAppOutputConfig(),
      external: resolvedExternal,
      plugins: plugins.filter(Boolean),
    }),
  ];
}
