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
import type { FederationPluginOptions, GenDynamicImportIdInfo, FederationRuntime, SharedConfig, FederationInfo } from "rollup-plugin-federation";
import { DependencyAnalyzer } from "rollup-plugin-federation";
import { resolve } from "node:path";

/**
 * Enhanced FynApp manifest with comprehensive dependency information
 */
export type FynAppManifest = {
  /** App name */
  name: string;
  /** App version */
  version: string;
  /** Modules exposed by this FynApp */
  exposes?: Record<string, {
    /** Source path of the exposed module */
    path: string;
    /** Final bundle chunk file for this module */
    chunk?: string;
  }>;
  /** Modules provided as shared by this FynApp */
  'provide-shared'?: Record<string, SharedConfig>;
  /** Dependencies for consuming shared modules */
  'consume-shared'?: Record<string, { requireVersion?: string }>;
  /** Dependencies for importing exposed modules */
  'import-exposed'?: Record<string, Record<string, { requireVersion?: string; sites?: string[] }>>;
};

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
      renderDynamicImport: {
        "fynapp-middleware": {
          idPrefix: "-FYNAPP_MIDDLEWARE",
          left: "",
          right: "",
          genId(info: GenDynamicImportIdInfo): string {
            return `${this.idPrefix} ${info.packageName} ${info.request} ${info.requireVersion}`;
          }
        },
        ...config.renderDynamicImport
      },
      emitFederationMeta: async (federationInfo: FederationInfo, runtime: FederationRuntime, context: any, bundle: any) => {
        const manifest = await generateFynAppManifest(federationInfo, runtime, context, bundle);
        context.emitFile({
          type: "asset",
          fileName: "fynapp-manifest.json",
          source: JSON.stringify(manifest, null, 2),
        });
      }
    }),
  ];
}

/**
 * Generates FynApp manifest with comprehensive dependency information
 *
 * @param runtime - Federation runtime with collected dependencies
 * @returns FynApp manifest object
 */
async function generateFynAppManifest(
  federationInfo: FederationInfo,
  runtime: FederationRuntime,
  context?: any,
  bundle?: any
): Promise<FynAppManifest> {
  const analyzer = new DependencyAnalyzer({}, "");
  const cwd = process.cwd();

  // Build exposes with final chunk information if context and bundle are available
  let exposes: Record<string, { path: string; chunk?: string }> | undefined;
  if (runtime.options.exposes && context && bundle) {
    exposes = {};
    for (const [exposeKey, exposePath] of Object.entries(runtime.options.exposes)) {
      const allChunks = getModuleBundles(context, bundle, resolve(cwd, exposePath));
      // Find the final chunk (the one that matches the expose key pattern)
      const finalChunk = allChunks.find(chunk =>
        chunk.endsWith('.js') &&
        !chunk.includes('/') && // Not a full path
        !chunk.startsWith('esm-') // Not an external module
      );

      exposes[exposeKey] = {
        path: exposePath,
        chunk: finalChunk
      };
    }
  } else {
    // Fallback to simple string mapping if no context/bundle
    exposes = runtime.options.exposes as any;
  }

  // Process consume-shared from federation config
  const consumeShared: Record<string, { requireVersion?: string }> = {};
  if (runtime.options.shared) {
    for (const [moduleName, config] of Object.entries(runtime.options.shared)) {
      if (config.import === false) {
        consumeShared[moduleName] = { requireVersion: config.requiredVersion };
      }
    }
  }

  // Process import-exposed from runtime.dynamicImports
  const importExposed: Record<string, Record<string, { requireVersion?: string; sites?: string[]; type?: string }>> = {};

  for (const dynImp of runtime.dynamicImports) {
    const { specifier, attributes, importer } = dynImp;

    // Only process mf-expose and fynapp-middleware imports
    if (!attributes || (attributes.type !== 'mf-expose' && attributes.type !== 'fynapp-middleware')) {
      continue;
    }

    // Parse specifier into package name and module path
    // Handle scoped packages: @scope/package/module -> package: @scope/package, module: module
    // Handle regular packages: package/module -> package: package, module: module
    let packageName: string;
    let modulePath: string;

    if (specifier.startsWith('@')) {
      // Scoped package: @scope/name/module/...
      const parts = specifier.split('/');
      if (parts.length >= 3) {
        packageName = `${parts[0]}/${parts[1]}`;
        modulePath = parts.slice(2).join('/');
      } else {
        continue; // Invalid format
      }
    } else {
      // Regular package: name/module/...
      const slashIndex = specifier.indexOf('/');
      if (slashIndex > 0) {
        packageName = specifier.substring(0, slashIndex);
        modulePath = specifier.substring(slashIndex + 1);
      } else {
        continue; // Invalid format
      }
    }

    // Make importer path relative to cwd
    const relativeSite = importer.startsWith(cwd)
      ? importer.substring(cwd.length + 1)
      : importer;

    // Initialize package entry if needed
    if (!importExposed[packageName]) {
      importExposed[packageName] = {};
    }

    // Initialize or update module entry
    if (!importExposed[packageName][modulePath]) {
      importExposed[packageName][modulePath] = {
        requireVersion: attributes.requireVersion,
        sites: [relativeSite],
        type: attributes.type === 'fynapp-middleware' ? 'middleware' : 'module'
      };
    } else {
      // Add site if not already present
      if (!importExposed[packageName][modulePath].sites?.includes(relativeSite)) {
        importExposed[packageName][modulePath].sites?.push(relativeSite);
      }
    }
  }

  // Filter provide-shared to only include modules that are actually being provided (not consume-only)
  const provideShared: Record<string, any> = {};
  if (runtime.options.shared) {
    for (const [moduleName, config] of Object.entries(runtime.options.shared)) {
      if (config.import !== false) {
        provideShared[moduleName] = config;
      }
    }
  }

  const manifest: FynAppManifest = {
    name: runtime.options.name,
    version: runtime.options.version || '1.0.0',
    exposes: exposes,
    'provide-shared': Object.keys(provideShared).length > 0 ? provideShared : undefined,
    'consume-shared': Object.keys(consumeShared).length > 0 ? consumeShared : undefined,
    'import-exposed': Object.keys(importExposed).length > 0 ? importExposed : undefined
  };

  return manifest;
}

/**
 * Helper function to get bundle information for each module
 */
function getModuleBundles(
  context: any,
  bundle: any,
  moduleId: string
): string[] {
  const moduleInfo = context.getModuleInfo(moduleId);
  if (!moduleInfo) return [];

  // Get chunks that directly contain this module
  const chunks: string[] = [...(moduleInfo.dynamicallyImportedIds || [])];

  // Also check if this module is part of a larger chunk
  for (const name in bundle) {
    const chunk = bundle[name] as any;
    if (chunk.moduleIds && chunk.moduleIds.includes(moduleId)) {
      if (!chunks.includes(chunk.fileName)) {
        chunks.push(chunk.fileName);
      }
    }
  }

  return chunks;
}
