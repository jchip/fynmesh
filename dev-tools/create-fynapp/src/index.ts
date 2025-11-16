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
import type {
  FederationPluginOptions,
  GenDynamicImportIdInfo,
  FederationRuntime,
  SharedConfig,
  FederationInfo,
} from "rollup-plugin-federation";
import { DependencyAnalyzer } from "rollup-plugin-federation";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

/**
 * Enhanced FynApp manifest with comprehensive dependency information
 */
export type FynAppManifest = {
  /** App name */
  name: string;
  /** App version */
  version: string;
  /** Modules exposed by this FynApp */
  exposes?: Record<
    string,
    {
      /** Source path of the exposed module */
      path: string;
      /** Final bundle chunk file for this module */
      chunk?: string;
    }
  >;
  /** Modules provided as shared by this FynApp */
  "provide-shared"?: Record<string, SharedConfig>;
  /** Dependencies for consuming shared modules */
  "consume-shared"?: Record<string, { semver?: string }>;
  /** Dependencies for importing exposed modules */
  "import-exposed"?: Record<string, Record<string, { semver?: string; sites?: string[] }>>;
  /** FynApps that provide shared modules consumed by this FynApp */
  "shared-providers"?: Record<string, { semver?: string; provides?: string[] }>;
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

export function setupFynAppOutputConfig(mode = env, sourceMap = true) {
  return {
    output: {
      dir: "dist",
      format: "system",
      sourcemap: sourceMap,
    },
  };
}

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
          semver: "^19.0.0",
        },
        "esm-react-dom": {
          import: false,
          singleton: false,
          semver: "^19.0.0",
        },
        ...config.shared,
      },
      renderDynamicImport: {
        "fynapp-middleware": {
          idPrefix: "-FYNAPP_MIDDLEWARE",
          left: "",
          right: "",
          genId(info: GenDynamicImportIdInfo): string {
            return `${this.idPrefix} ${info.packageName} ${info.request} ${info.semver}`;
          },
        },
        ...config.renderDynamicImport,
      },
      enrichManifest: createEnrichManifest(),
      emitFederationMeta: createEmitFederationMeta(),
    }),
  ];
}

/**
 * FynApp middleware dynamic import configuration for rollup-plugin-federation
 * Use this to enable middleware loading when not using setupFederationPlugins
 *
 * @example
 * ```ts
 * import { fynappMiddlewareDynamicImport } from 'create-fynapp';
 *
 * newRollupPlugin(federation)({
 *   name: "my-app",
 *   renderDynamicImport: {
 *     ...fynappMiddlewareDynamicImport
 *   }
 * })
 * ```
 */
export const fynappMiddlewareDynamicImport = {
  "fynapp-middleware": {
    idPrefix: "-FYNAPP_MIDDLEWARE",
    left: "",
    right: "",
    genId(info: any): string {
      return `${this.idPrefix} ${info.packageName} ${info.request} ${info.semver}`;
    },
  },
};

/**
 * Sets up federation plugin with FynMesh-specific configurations
 * Framework-agnostic version that includes middleware support and manifest generation
 *
 * @example
 * ```ts
 * import { setupFederationPlugins } from 'create-fynapp';
 *
 * plugins: [
 *   ...setupFederationPlugins({
 *     name: "my-app",
 *     exposes: {
 *       "./main": "./src/main.js"
 *     },
 *     shared: {
 *       "my-lib": {
 *         singleton: true,
 *         semver: "^1.0.0"
 *       }
 *     }
 *   })
 * ]
 * ```
 */
export function setupFederationPlugins(
  config: Partial<FederationPluginOptions> & { name: string },
) {
  return [
    newRollupPlugin(federation)({
      shareScope: fynmeshShareScope,
      filename: fynappEntryFilename,
      ...config,
      renderDynamicImport: {
        ...fynappMiddlewareDynamicImport,
        ...config.renderDynamicImport,
      },
      enrichManifest: createEnrichManifest(),
      emitFederationMeta: createEmitFederationMeta(),
    }),
  ];
}

/**
 * Creates an enrichManifest callback that enriches the base manifest with FynApp-specific data
 * This hook is called during entry code generation with base manifest data (exposes, shared, dynamicImports).
 * The enriched manifest will be embedded in the entry file and also emitted as fynapp.manifest.json.
 *
 * @example
 * ```ts
 * import { createEnrichManifest, fynappMiddlewareDynamicImport } from 'create-fynapp';
 *
 * newRollupPlugin(federation)({
 *   name: "my-app",
 *   renderDynamicImport: {
 *     ...fynappMiddlewareDynamicImport
 *   },
 *   enrichManifest: createEnrichManifest()
 * })
 * ```
 */
export function createEnrichManifest() {
  return async (baseManifest: any, runtime: FederationRuntime, context: any) => {
    const cwd = process.cwd();

    // Debug: Log dynamicImports to see what we're receiving
    console.log("enrichManifest - dynamicImports count:", baseManifest.dynamicImports?.length);
    if (baseManifest.dynamicImports?.length > 0) {
      console.log(
        "enrichManifest - first dynamicImport:",
        JSON.stringify(baseManifest.dynamicImports[0], null, 2),
      );
    }

    // Process consume-shared from shared config
    const consumeShared: Record<string, { semver?: string }> = {};
    if (baseManifest.shared) {
      for (const [moduleName, config] of Object.entries(
        baseManifest.shared as Record<string, any>,
      )) {
        if (config.import === false) {
          consumeShared[moduleName] = { semver: config.semver };
        }
      }
    }

    // Process provide-shared from shared config
    const provideShared: Record<string, any> = {};
    if (baseManifest.shared) {
      for (const [moduleName, config] of Object.entries(
        baseManifest.shared as Record<string, any>,
      )) {
        if (config.import !== false) {
          provideShared[moduleName] = config;
        }
      }
    }

    // Process import-exposed from dynamicImports
    const importExposed: Record<
      string,
      Record<string, { semver?: string; sites?: string[]; type?: string }>
    > = {};
    for (const dynImp of baseManifest.dynamicImports) {
      const { specifier, attributes, importer } = dynImp;

      // Only process mf-expose and fynapp-middleware imports
      if (
        !attributes ||
        (attributes.type !== "mf-expose" && attributes.type !== "fynapp-middleware")
      ) {
        continue;
      }

      // Parse specifier into package name and module path
      let packageName: string;
      let modulePath: string;

      if (specifier.startsWith("@")) {
        // Scoped package: @scope/name/module/...
        const parts = specifier.split("/");
        if (parts.length >= 3) {
          packageName = `${parts[0]}/${parts[1]}`;
          modulePath = parts.slice(2).join("/");
        } else {
          continue;
        }
      } else {
        // Regular package: name/module/...
        const slashIndex = specifier.indexOf("/");
        if (slashIndex > 0) {
          packageName = specifier.substring(0, slashIndex);
          modulePath = specifier.substring(slashIndex + 1);
        } else {
          continue;
        }
      }

      // Make importer path relative to cwd
      const relativeSite = importer.startsWith(cwd) ? importer.substring(cwd.length + 1) : importer;

      // Initialize package entry if needed
      if (!importExposed[packageName]) {
        importExposed[packageName] = {};
      }

      // Initialize or update module entry
      if (!importExposed[packageName][modulePath]) {
        const entry: any = {
          semver: attributes.semver,
          sites: [relativeSite],
          type: attributes.type === "fynapp-middleware" ? "middleware" : "module",
        };

        // For middleware imports, parse the modulePath to extract expose module and middleware name
        // Split on the last `/`:
        //   - exposeModule = everything before the last `/`
        //   - middlewareName = everything after the last `/`
        // Example: "middleware/design-tokens/design-tokens"
        //   - exposeModule = "middleware/design-tokens"
        //   - middlewareName = "design-tokens"
        if (attributes.type === "fynapp-middleware") {
          const lastSlashIndex = modulePath.lastIndexOf("/");

          if (lastSlashIndex > 0) {
            entry.exposeModule = modulePath.substring(0, lastSlashIndex);
            entry.middlewareName = modulePath.substring(lastSlashIndex + 1);
          } else {
            // No slash found, treat entire path as middleware name
            entry.exposeModule = modulePath;
            entry.middlewareName = modulePath;
          }

          console.log(
            `[enrichManifest] Added middleware fields: packageName=${packageName}, modulePath=${modulePath}, exposeModule=${entry.exposeModule}, middlewareName=${entry.middlewareName}`,
          );
        }

        importExposed[packageName][modulePath] = entry;
      } else {
        // Add site if not already present
        if (!importExposed[packageName][modulePath].sites?.includes(relativeSite)) {
          importExposed[packageName][modulePath].sites?.push(relativeSite);
        }
      }
    }

    // Detect shared providers
    const sharedProviders = detectSharedProviders(consumeShared, provideShared, cwd);

    // Debug: Log importExposed to see if middleware fields are present
    console.log("[enrichManifest] Final importExposed:", JSON.stringify(importExposed, null, 2));

    // Build enriched manifest
    const enrichedManifest = {
      name: baseManifest.name,
      version: baseManifest.version,
      exposes: baseManifest.exposes,
      "provide-shared": Object.keys(provideShared).length > 0 ? provideShared : undefined,
      "consume-shared": Object.keys(consumeShared).length > 0 ? consumeShared : undefined,
      "import-exposed": Object.keys(importExposed).length > 0 ? importExposed : undefined,
      "shared-providers": Object.keys(sharedProviders).length > 0 ? sharedProviders : undefined,
    };

    console.log(
      "[enrichManifest] Final enrichedManifest:",
      JSON.stringify(enrichedManifest, null, 2),
    );

    return enrichedManifest;
  };
}

/**
 * Creates an emitFederationMeta callback that generates fynapp.manifest.json
 * Use this with rollup-plugin-federation when you need custom configuration
 *
 * @example
 * ```ts
 * import { createEmitFederationMeta, fynappMiddlewareDynamicImport } from 'create-fynapp';
 *
 * newRollupPlugin(federation)({
 *   name: "my-app",
 *   renderDynamicImport: {
 *     ...fynappMiddlewareDynamicImport
 *   },
 *   emitFederationMeta: createEmitFederationMeta()
 * })
 * ```
 */
export function createEmitFederationMeta() {
  return async (
    federationInfo: FederationInfo,
    runtime: FederationRuntime,
    context: any,
    bundle: any,
  ) => {
    // Use the enriched manifest from runtime.fynappManifest instead of regenerating
    // This ensures we keep all the enriched fields like exposeModule and middlewareName
    const manifest =
      runtime.fynappManifest ||
      (await generateFynAppManifest(federationInfo, runtime, context, bundle));

    console.log("[createEmitFederationMeta] Using manifest:", JSON.stringify(manifest, null, 2));

    // Still emit the manifest file for backwards compatibility and debugging
    context.emitFile({
      type: "asset",
      fileName: "fynapp.manifest.json",
      source: JSON.stringify(manifest, null, 2),
    });
  };
}

/**
 * Detects which FynApps provide the shared modules consumed by this FynApp
 *
 * @param consumeShared - Map of consumed shared modules
 * @param cwd - Current working directory
 * @returns Map of provider FynApps to their provided modules and versions
 */
function detectSharedProviders(
  consumeShared: Record<string, { semver?: string }>,
  provideShared: Record<string, any>,
  cwd: string,
): Record<string, { semver?: string; provides?: string[] }> {
  const sharedProviders: Record<string, { semver?: string; provides?: string[] }> = {};

  // Step 1: Collect all shared modules (both consumed and provided)
  const allSharedModules = { ...consumeShared };
  for (const key of Object.keys(provideShared)) {
    if (!allSharedModules[key]) {
      allSharedModules[key] = { semver: provideShared[key]?.semver };
    }
  }

  if (Object.keys(allSharedModules).length === 0) {
    return sharedProviders;
  }

  // Step 2: Read package.json dependencies
  const packageJsonPath = resolve(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    return sharedProviders;
  }

  let packageJson: any;
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  } catch (e) {
    return sharedProviders;
  }

  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  // Step 3: For each dependency, check if it has fynapp.manifest.json with provide-shared
  for (const [depName, depVersion] of Object.entries(allDependencies)) {
    // Try to find the dependency's manifest
    // First try in node_modules
    const nodeModulesManifestPath = resolve(
      cwd,
      "node_modules",
      depName,
      "dist",
      "fynapp.manifest.json",
    );
    // Also try relative path for monorepo (peer FynApps in demo/)
    const relativeManifestPath = resolve(cwd, "..", depName, "dist", "fynapp.manifest.json");

    let manifestPath: string | null = null;
    if (existsSync(nodeModulesManifestPath)) {
      manifestPath = nodeModulesManifestPath;
    } else if (existsSync(relativeManifestPath)) {
      manifestPath = relativeManifestPath;
    }

    if (!manifestPath) {
      continue;
    }

    let depManifest: any;
    try {
      depManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch (e) {
      continue;
    }

    // Step 4: Check if this dependency provides any of the consumed shared modules
    if (!depManifest["provide-shared"]) {
      continue;
    }

    const providedModules: string[] = [];
    for (const sharedModule of Object.keys(allSharedModules)) {
      if (depManifest["provide-shared"][sharedModule]) {
        providedModules.push(sharedModule);
      }
    }

    if (providedModules.length > 0) {
      sharedProviders[depName] = {
        semver: typeof depVersion === "string" ? depVersion : undefined,
        provides: providedModules,
      };
    }
  }

  return sharedProviders;
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
  bundle?: any,
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
      const finalChunk = allChunks.find(
        (chunk) =>
          chunk.endsWith(".js") &&
          !chunk.includes("/") && // Not a full path
          !chunk.startsWith("esm-"), // Not an external module
      );

      exposes[exposeKey] = {
        path: exposePath,
        chunk: finalChunk,
      };
    }
  } else {
    // Fallback to simple string mapping if no context/bundle
    exposes = runtime.options.exposes as any;
  }

  // Process consume-shared from federation config
  const consumeShared: Record<string, { semver?: string }> = {};
  if (runtime.options.shared) {
    for (const [moduleName, config] of Object.entries(runtime.options.shared)) {
      if (config.import === false) {
        consumeShared[moduleName] = { semver: config.semver };
      }
    }
  }

  // Process import-exposed from runtime.dynamicImports
  const importExposed: Record<
    string,
    Record<string, { semver?: string; sites?: string[]; type?: string }>
  > = {};

  for (const dynImp of runtime.dynamicImports) {
    const { specifier, attributes, importer } = dynImp;

    // Only process mf-expose and fynapp-middleware imports
    if (
      !attributes ||
      (attributes.type !== "mf-expose" && attributes.type !== "fynapp-middleware")
    ) {
      continue;
    }

    // Parse specifier into package name and module path
    // Handle scoped packages: @scope/package/module -> package: @scope/package, module: module
    // Handle regular packages: package/module -> package: package, module: module
    let packageName: string;
    let modulePath: string;

    if (specifier.startsWith("@")) {
      // Scoped package: @scope/name/module/...
      const parts = specifier.split("/");
      if (parts.length >= 3) {
        packageName = `${parts[0]}/${parts[1]}`;
        modulePath = parts.slice(2).join("/");
      } else {
        continue; // Invalid format
      }
    } else {
      // Regular package: name/module/...
      const slashIndex = specifier.indexOf("/");
      if (slashIndex > 0) {
        packageName = specifier.substring(0, slashIndex);
        modulePath = specifier.substring(slashIndex + 1);
      } else {
        continue; // Invalid format
      }
    }

    // Make importer path relative to cwd
    const relativeSite = importer.startsWith(cwd) ? importer.substring(cwd.length + 1) : importer;

    // Initialize package entry if needed
    if (!importExposed[packageName]) {
      importExposed[packageName] = {};
    }

    // Initialize or update module entry
    if (!importExposed[packageName][modulePath]) {
      importExposed[packageName][modulePath] = {
        semver: attributes.semver,
        sites: [relativeSite],
        type: attributes.type === "fynapp-middleware" ? "middleware" : "module",
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

  // Detect which FynApps provide the consumed shared modules
  const sharedProviders = detectSharedProviders(consumeShared, provideShared, cwd);

  const manifest: FynAppManifest = {
    name: runtime.options.name,
    version: runtime.options.version || "1.0.0",
    exposes: exposes,
    "provide-shared": Object.keys(provideShared).length > 0 ? provideShared : undefined,
    "consume-shared": Object.keys(consumeShared).length > 0 ? consumeShared : undefined,
    "import-exposed": Object.keys(importExposed).length > 0 ? importExposed : undefined,
    "shared-providers": Object.keys(sharedProviders).length > 0 ? sharedProviders : undefined,
  };

  return manifest;
}

/**
 * Helper function to get bundle information for each module
 */
function getModuleBundles(context: any, bundle: any, moduleId: string): string[] {
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
