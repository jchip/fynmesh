/**
 * Module Loading Module
 * Handles FynApp module loading and execution
 */

import type {
  FynApp,
  FynAppEntry,
  FynUnit,
  FynUnitRuntime,
  FynAppMiddlewareReg,
  FynMeshKernel,
} from "../types";
import {
  ModuleLoadError,
  KernelErrorCode,
  Result,
  ok,
  err,
} from "../errors";

/**
 * Callback type for middleware scanning
 * Returns array of middleware export names that were registered
 */
export type MiddlewareScanner = (
  fynApp: FynApp,
  exposeName: string,
  exposedModule: any
) => string[];

export class ModuleLoader {

  /**
   * Load an expose module from a FynApp
   * @param fynApp - The FynApp to load the module from
   * @param exposeName - The name of the exposed module (e.g., "./main")
   * @param loadMiddlewares - Whether to scan for and register middlewares
   * @param middlewareScanner - Callback to scan and register middleware (delegates to MiddlewareManager)
   * @returns Result with the loaded module or an error
   */
  async loadExposeModule(
    fynApp: FynApp,
    exposeName: string,
    loadMiddlewares?: boolean,
    middlewareScanner?: MiddlewareScanner
  ): Promise<Result<any, ModuleLoadError>> {
    const container = fynApp.entry.container;
    if (!container?.$E[exposeName]) {
      const error = new ModuleLoadError(
        KernelErrorCode.EXPOSE_MODULE_NOT_FOUND,
        `No expose module '${exposeName}' found for ${fynApp.name}@${fynApp.version}`,
        {
          fynAppName: fynApp.name,
          fynAppVersion: fynApp.version,
          exposeName,
        }
      );
      console.debug(`❌ ${error.message}`);
      return err(error);
    }

    const factory = await fynApp.entry.get(exposeName);
    const exposedModule = typeof factory === "function" ? factory() : undefined;

    if (loadMiddlewares && exposedModule && typeof exposedModule === "object") {
      // Delegate middleware scanning to MiddlewareManager via callback
      // This ensures single source of truth for scanning logic and deduplication
      if (middlewareScanner) {
        middlewareScanner(fynApp, exposeName, exposedModule);
      }

      fynApp.exposes[exposeName] = exposedModule;
      if ((exposedModule as any).__name) {
        fynApp.exposes[(exposedModule as any).__name] = exposedModule;
      }

      return ok(exposedModule);
    }

    // Module loaded but no middleware processing needed
    return ok(exposedModule);
  }

  /**
   * Load middleware from a dependency package
   * @param packageName - Name of the dependency package
   * @param middlewarePath - Path to the middleware within the package
   * @param appsLoaded - Map of loaded FynApps
   * @param middlewareScanner - Callback to scan and register middleware
   * @returns Result indicating success or error with details
   */
  async loadMiddlewareFromDependency(
    packageName: string,
    middlewarePath: string,
    appsLoaded: Record<string, FynApp>,
    middlewareScanner?: MiddlewareScanner
  ): Promise<Result<void, ModuleLoadError>> {
    console.debug(`📦 Loading middleware from dependency: ${packageName}/${middlewarePath}`);

    // Find the dependency fynapp
    const dependencyApp = appsLoaded[packageName];

    if (!dependencyApp) {
      const error = new ModuleLoadError(
        KernelErrorCode.DEPENDENCY_NOT_FOUND,
        `Dependency package ${packageName} not found in runtime`,
        {
          fynAppName: packageName,
          exposeName: middlewarePath,
        }
      );
      console.debug(`❌ ${error.message}`);
      return err(error);
    }

    // Extract the expose module from the middleware path
    // The path format is: exposeModule/middlewareName
    // Example: "middleware/design-tokens/design-tokens" -> exposeModule = "middleware/design-tokens"
    const lastSlashIndex = middlewarePath.lastIndexOf('/');
    const exposeModule = lastSlashIndex > 0 ? middlewarePath.substring(0, lastSlashIndex) : middlewarePath;
    const exposeName = `./${exposeModule}`;

    console.debug(`📦 Loading middleware module ${exposeName} from ${packageName} (full path: ${middlewarePath})`);
    const result = await this.loadExposeModule(dependencyApp, exposeName, true, middlewareScanner);

    if (!result.success) {
      return err(result.error);
    }

    return ok(undefined);
  }

  /**
   * Load the basics of a FynApp
   * @param fynAppEntry - The FynApp entry point
   * @param appsLoaded - Map of loaded FynApps
   * @param middlewareScanner - Callback to scan and register middleware
   */
  async loadFynAppBasics(
    fynAppEntry: FynAppEntry,
    appsLoaded: Record<string, FynApp>,
    middlewareScanner?: MiddlewareScanner
  ): Promise<FynApp> {
    const container = fynAppEntry.container;

    if (!container?.name || !container?.version) {
      throw new Error(`Invalid FynApp container: ${JSON.stringify(container)}`);
    }

    console.debug("🚀 Initializing FynApp entry", container.name, container.version);

    // Step 1: Initialize the entry
    fynAppEntry.init();

    console.debug("🚀 Loading FynApp basics for", container.name, container.version);

    // Step 2: Create FynApp object early for event processing
    const fynApp: FynApp = {
      name: container.name,
      version: container.version || "1.0.0",
      packageName: container.name,
      entry: fynAppEntry,
      middlewareContext: new Map<string, any>(),
      exposes: {},
    };

    // Step 3: Load config
    if (container && container.$E["./config"]) {
      const factory = await fynAppEntry.get("./config");
      fynApp.config = factory();
    }

    // Step 4: Invoke entry.setup if it exists
    if (fynAppEntry.setup) {
      console.debug("🚀 Invoking entry.setup for", fynApp.name, fynApp.version);
      await fynAppEntry.setup();
    }

    // Step 5: Load main module
    const mainResult = await this.loadExposeModule(fynApp, "./main", true, middlewareScanner);
    if (!mainResult.success) {
      // Main module not found is not fatal - some FynApps may not have a main module
      console.debug(`⚠️ Main module not loaded for ${fynApp.name}: ${mainResult.error.message}`);
    }

    // Step 6: Proactively load middleware from dependencies
    // Get the embedded manifest from the container
    // The manifest is exported directly on the container, not as an expose module
    const manifest = (container as any).__FYNAPP_MANIFEST__ || null;

    const importExposed = manifest?.["import-exposed"];
    if (importExposed && typeof importExposed === "object") {
      console.debug("📦 Loading middleware dependencies for", fynApp.name);

      // Collect errors for reporting but continue loading other dependencies
      const loadErrors: ModuleLoadError[] = [];

      for (const [packageName, modules] of Object.entries(importExposed)) {
        if (modules && typeof modules === "object") {
          for (const [modulePath, moduleInfo] of Object.entries(modules)) {
            // Only load middleware type dependencies
            if (moduleInfo && typeof moduleInfo === "object" && moduleInfo.type === "middleware") {
              // The modulePath key is already the correct exposed module path (e.g., "middleware/design-tokens")
              // which corresponds to the "./middleware/design-tokens" expose
              console.debug(`📦 Proactively loading middleware: ${packageName}/${modulePath}`);
              const depResult = await this.loadMiddlewareFromDependency(
                packageName,
                modulePath,
                appsLoaded,
                middlewareScanner
              );
              if (!depResult.success) {
                loadErrors.push(depResult.error);
              }
            }
          }
        }
      }

      // Log collected errors but don't fail - middleware deps may be optional
      if (loadErrors.length > 0) {
        console.debug(`⚠️ ${loadErrors.length} middleware dependency load error(s) for ${fynApp.name}:`,
          loadErrors.map(e => e.message));
      }
    }

    console.debug("✅ FynApp basics loaded for", fynApp.name, fynApp.version);

    // Record app in runtime registry for observability
    // Use name@version as key to support multiple versions of the same package
    const appKey = `${fynApp.name}@${fynApp.version}`;
    appsLoaded[appKey] = fynApp;
    // Also store by name for backward compatibility and simple lookups
    appsLoaded[fynApp.name] = fynApp;

    return fynApp;
  }

  /**
   * Create a FynUnit runtime
   */
  createFynUnitRuntime(fynApp: FynApp): FynUnitRuntime {
    return {
      fynApp,
      middlewareContext: new Map<string, Record<string, any>>(),
    };
  }

  /**
   * @deprecated Use createFynUnitRuntime instead
   */
  createFynModuleRuntime(fynApp: FynApp): FynUnitRuntime {
    return this.createFynUnitRuntime(fynApp);
  }

  /**
   * Find execution override middleware
   */
  findExecutionOverride(
    fynApp: FynApp,
    fynUnit: FynUnit,
    autoApplyMiddlewares?: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    }
  ): FynAppMiddlewareReg | null {
    if (!autoApplyMiddlewares) return null;

    // Check middleware that auto-applies to this FynApp type
    const isMiddlewareProvider = Object.keys(fynApp.exposes).some(key =>
      key.startsWith('./middleware')
    );

    const targetMiddlewares = isMiddlewareProvider
      ? autoApplyMiddlewares.middleware
      : autoApplyMiddlewares.fynapp;

    // Find first middleware that can override execution
    for (const mwReg of targetMiddlewares) {
      if (mwReg.middleware.canOverrideExecution?.(fynApp, fynUnit)) {
        return mwReg;
      }
    }

    return null;
  }

  /**
   * Invoke a FynUnit
   */
  async invokeFynUnit(
    fynUnit: FynUnit,
    fynApp: FynApp,
    autoApplyMiddlewares?: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    },
    kernel?: FynMeshKernel
  ): Promise<void> {
    const runtime = this.createFynUnitRuntime(fynApp);

    // Check for middleware execution overrides
    const executionOverride = this.findExecutionOverride(fynApp, fynUnit, autoApplyMiddlewares);

    if (executionOverride) {
      console.debug(`🎭 Middleware ${executionOverride.middleware.name} is overriding execution for ${fynApp.name}`);

      const context = {
        meta: {
          info: {
            name: executionOverride.middleware.name,
            provider: executionOverride.hostFynApp.name,
            version: executionOverride.hostFynApp.version
          },
          config: {}
        },
        fynUnit,
        fynMod: fynUnit, // deprecated compatibility
        fynApp,
        reg: executionOverride,
        runtime,
        kernel: kernel!,
        status: "ready",
      };

      // Let middleware handle initialize
      if (executionOverride.middleware.overrideInitialize && fynUnit.initialize) {
        console.debug(`🎭 Middleware overriding initialize for ${fynApp.name}`);
        const initResult = await executionOverride.middleware.overrideInitialize(context);
        console.debug(`🎭 Initialize result:`, initResult);
      }

      // Let middleware handle execute
      if (executionOverride.middleware.overrideExecute && typeof fynUnit.execute === 'function') {
        console.debug(`🎭 Middleware overriding execute for ${fynApp.name}`);
        await executionOverride.middleware.overrideExecute(context);
      }

      return;
    }

    // Original execution flow for non-overridden units
    if (fynUnit.initialize) {
      console.debug("🚀 Invoking unit.initialize for", fynApp.name, fynApp.version);
      const initResult = await fynUnit.initialize(runtime);
      console.debug("🚀 Initialize result:", initResult);
    }

    if (fynUnit.execute) {
      console.debug("🚀 Invoking unit.execute for", fynApp.name, fynApp.version);
      const executeResult = await fynUnit.execute(runtime);

      // Handle execution result - middleware defines contract, kernel just passes through
      if (executeResult) {
        console.debug(`📦 FynUnit returned result:`, typeof executeResult === 'object' ? executeResult.type : typeof executeResult);
      }
    }
  }

  /**
   * @deprecated Use invokeFynUnit instead
   */
  async invokeFynModule(
    fynMod: FynUnit,
    fynApp: FynApp,
    autoApplyMiddlewares?: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    },
    kernel?: FynMeshKernel
  ): Promise<void> {
    return this.invokeFynUnit(fynMod, fynApp, autoApplyMiddlewares, kernel);
  }

  /**
   * Clear module loader state
   * Note: Middleware scanning state is now managed by MiddlewareManager
   */
  clear(): void {
    // No local state to clear - middleware scanning delegated to MiddlewareManager
  }
}
