/**
 * Module Loading Module
 * Handles FynApp module loading and execution
 */

import type {
  FynApp,
  FynAppEntry,
  FynModule,
  FynModuleRuntime,
  FynAppMiddleware,
  FynAppMiddlewareReg,
} from "../types";

export class ModuleLoader {
  private scannedModules: Set<string> = new Set();

  /**
   * Load an expose module from a FynApp
   */
  async loadExposeModule(
    fynApp: FynApp,
    exposeName: string,
    loadMiddlewares?: boolean,
    middlewareRegistrar?: (mwReg: FynAppMiddlewareReg) => void
  ): Promise<any> {
    const container = fynApp.entry.container;
    if (!container?.$E[exposeName]) {
      console.debug(`❌ No expose module '${exposeName}' found for`, fynApp.name, fynApp.version);
      return;
    }

    if (container?.$E[exposeName]) {
      const factory = await fynApp.entry.get(exposeName);
      const exposedModule = typeof factory === "function" ? factory() : undefined;

      const mwExports = [];

      // Create cache key to track if we've already scanned this module for middleware
      const scanCacheKey = `${fynApp.name}@${fynApp.version}::${exposeName}`;

      if (loadMiddlewares && exposedModule && typeof exposedModule === "object") {
        // Check if we've already scanned this module
        if (!this.scannedModules.has(scanCacheKey)) {
          // Mark as scanned before processing to prevent duplicate scans
          this.scannedModules.add(scanCacheKey);

          for (const [exportName, exportValue] of Object.entries(exposedModule)) {
            if (exportName.startsWith("__middleware__")) {
              const middleware = exportValue as FynAppMiddleware;
              const mwName = middleware.name;
              const mwReg: FynAppMiddlewareReg = {
                regKey: `${fynApp.name}::${mwName}`,
                fullKey: `${fynApp.name}@${fynApp.version}::${mwName}`,
                hostFynApp: fynApp,
                exposeName: exposeName,
                exportName,
                middleware,
              };
              
              // Register middleware using the provided registrar
              if (middlewareRegistrar) {
                middlewareRegistrar(mwReg);
              }
              mwExports.push(exportName);
            }
          }

          console.debug(
            `✅ Expose module '${exposeName}' loaded for`,
            fynApp.name,
            fynApp.version,
            mwExports.length > 0 ? "middlewares registered:" : "",
            mwExports.join(", "),
          );
        } else {
          console.debug(
            `⏭️  Skipping middleware scan for '${exposeName}' - already scanned for`,
            fynApp.name,
            fynApp.version,
          );
        }

        fynApp.exposes[exposeName] = exposedModule;
        if ((exposedModule as any).__name) {
          fynApp.exposes[(exposedModule as any).__name] = exposedModule;
        }

        return exposedModule;
      }
      return;
    }
  }

  /**
   * Load middleware from a dependency package
   */
  async loadMiddlewareFromDependency(
    packageName: string,
    middlewarePath: string,
    appsLoaded: Record<string, FynApp>,
    middlewareRegistrar?: (mwReg: FynAppMiddlewareReg) => void
  ): Promise<void> {
    console.debug(`📦 Loading middleware from dependency: ${packageName}/${middlewarePath}`);

    // Find the dependency fynapp
    const dependencyApp = appsLoaded[packageName];

    if (!dependencyApp) {
      console.debug(`❌ Dependency package ${packageName} not found in runtime`);
      return;
    }

    // Extract the expose module from the middleware path
    // The path format is: exposeModule/middlewareName
    // Example: "middleware/design-tokens/design-tokens" -> exposeModule = "middleware/design-tokens"
    const lastSlashIndex = middlewarePath.lastIndexOf('/');
    const exposeModule = lastSlashIndex > 0 ? middlewarePath.substring(0, lastSlashIndex) : middlewarePath;
    const exposeName = `./${exposeModule}`;

    console.debug(`📦 Loading middleware module ${exposeName} from ${packageName} (full path: ${middlewarePath})`);
    await this.loadExposeModule(dependencyApp, exposeName, true, middlewareRegistrar);
  }

  /**
   * Load the basics of a FynApp
   */
  async loadFynAppBasics(
    fynAppEntry: FynAppEntry,
    appsLoaded: Record<string, FynApp>,
    middlewareRegistrar?: (mwReg: FynAppMiddlewareReg) => void
  ): Promise<FynApp> {
    const container = fynAppEntry.container;

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
    await this.loadExposeModule(fynApp, "./main", true, middlewareRegistrar);

    // Step 6: Proactively load middleware from dependencies
    // Get the embedded manifest from the container
    // The manifest is exported directly on the container, not as an expose module
    const manifest = (container as any).__FYNAPP_MANIFEST__ || null;

    const importExposed = manifest?.["import-exposed"];
    if (importExposed && typeof importExposed === "object") {
      console.debug("📦 Loading middleware dependencies for", fynApp.name);

      for (const [packageName, modules] of Object.entries(importExposed)) {
        if (modules && typeof modules === "object") {
          for (const [modulePath, moduleInfo] of Object.entries(modules)) {
            // Only load middleware type dependencies
            if (moduleInfo && typeof moduleInfo === "object" && moduleInfo.type === "middleware") {
              // The modulePath key is already the correct exposed module path (e.g., "middleware/design-tokens")
              // which corresponds to the "./middleware/design-tokens" expose
              console.debug(`📦 Proactively loading middleware: ${packageName}/${modulePath}`);
              await this.loadMiddlewareFromDependency(
                packageName,
                modulePath,
                appsLoaded,
                middlewareRegistrar
              );
            }
          }
        }
      }
    }

    console.debug("✅ FynApp basics loaded for", fynApp.name, fynApp.version);

    // Record app in runtime registry for observability
    appsLoaded[fynApp.name] = fynApp;

    return fynApp;
  }

  /**
   * Create a FynModule runtime
   */
  createFynModuleRuntime(fynApp: FynApp): FynModuleRuntime {
    return {
      fynApp,
      middlewareContext: new Map<string, Record<string, any>>(),
    };
  }

  /**
   * Find execution override middleware
   */
  findExecutionOverride(
    fynApp: FynApp,
    fynModule: FynModule,
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
      if (mwReg.middleware.canOverrideExecution?.(fynApp, fynModule)) {
        return mwReg;
      }
    }

    return null;
  }

  /**
   * Invoke a FynModule
   */
  async invokeFynModule(
    fynMod: FynModule,
    fynApp: FynApp,
    autoApplyMiddlewares?: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    }
  ): Promise<void> {
    const runtime = this.createFynModuleRuntime(fynApp);

    // Check for middleware execution overrides
    const executionOverride = this.findExecutionOverride(fynApp, fynMod, autoApplyMiddlewares);

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
        fynMod,
        fynApp,
        reg: executionOverride,
        runtime,
        kernel: null as any, // Kernel reference injected by caller
        status: "ready",
      };

      // Let middleware handle initialize
      if (executionOverride.middleware.overrideInitialize && fynMod.initialize) {
        console.debug(`🎭 Middleware overriding initialize for ${fynApp.name}`);
        const initResult = await executionOverride.middleware.overrideInitialize(context);
        console.debug(`🎭 Initialize result:`, initResult);
      }

      // Let middleware handle execute
      if (executionOverride.middleware.overrideExecute && typeof fynMod.execute === 'function') {
        console.debug(`🎭 Middleware overriding execute for ${fynApp.name}`);
        await executionOverride.middleware.overrideExecute(context);
      }

      return;
    }

    // Original execution flow for non-overridden modules
    if (fynMod.initialize) {
      console.debug("🚀 Invoking module.initialize for", fynApp.name, fynApp.version);
      const initResult = await fynMod.initialize(runtime);
      console.debug("🚀 Initialize result:", initResult);
    }

    if (fynMod.execute) {
      console.debug("🚀 Invoking module.execute for", fynApp.name, fynApp.version);
      const executeResult = await fynMod.execute(runtime);

      // Handle typed execution result
      if (executeResult) {
        console.debug(`📦 FynModule returned typed result:`, executeResult.type, executeResult.metadata);
      }
    }
  }

  /**
   * Clear module loader state
   */
  clear(): void {
    this.scannedModules.clear();
  }
}
