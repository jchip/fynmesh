import { FynEventTarget } from "./event-target";
import { fynMeshShareScope } from "./share-scope";
import {
  FynAppInfo,
  FynMeshKernel,
  FynAppMiddleware,
  FynMeshRuntimeData,
  FynApp,
  MiddlewareContext,
  MiddlewareInfo,
  MiddlewareUsage,
} from "./types";
import type { FederationEntry } from "federation-js";
import { urlJoin } from "./util";

/**
 * Abstract base class for FynMesh kernel implementations
 * Contains all platform-agnostic logic
 */
export abstract class FynMeshKernelCore implements FynMeshKernel {
  public readonly events: FynEventTarget;
  public readonly version: string = "1.0.0";
  public readonly shareScopeName: string = fynMeshShareScope;

  protected runTime: FynMeshRuntimeData;

  constructor() {
    this.events = new FynEventTarget();
    this.runTime = {
      appsLoaded: {},
      middlewares: {},
    };
  }

  /**
   * Register a middleware implementation
   */
  registerMiddleware(
    middleware: FynAppMiddleware,
    provider: string,
    fynAppVersion = "default",
  ): void {
    // Create fynapp-prefixed key to avoid name collisions
    const middlewareKey = `${provider}::${middleware.name}`;

    const versionMap = this.runTime.middlewares[middlewareKey] || {};
    versionMap[fynAppVersion] = {
      fynApp: { name: provider, version: fynAppVersion } as FynApp,
      config: {},
      moduleName: `__middleware__${middleware.name}`,
      exportName: middleware.name,
      implementation: middleware,
    };
    this.runTime.middlewares[middlewareKey] = versionMap;
  }

  /**
   * Get middleware by name and provider
   */
  getMiddleware<T = any>(name: string, provider: string): T | undefined {
    const middlewareKey = `${provider}::${name}`;
    const versionMap = this.runTime.middlewares[middlewareKey];
    if (versionMap) {
      // Get the latest version (or could implement version resolution logic)
      const versions = Object.keys(versionMap).sort();
      const latestVersion = versions[versions.length - 1];
      return versionMap[latestVersion]?.implementation as T;
    }
    return undefined;
  }

  /**
   * Check if middleware is available
   */
  hasMiddleware(name: string, provider: string): boolean {
    const middlewareKey = `${provider}::${name}`;
    return middlewareKey in this.runTime.middlewares;
  }

  /**
   * Initialize the kernel runtime data
   */
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData {
    this.runTime = {
      ...data,
    };
    return this.runTime;
  }

  /**
   * Clean up a container name to ensure it's a valid identifier
   */
  cleanContainerName(name: string): string {
    return name.replace(/[\@\-./]/g, "_").replace(/^_*/, "");
  }

  /**
   * Bootstrap a single fynapp entry through the complete lifecycle
   */
  async bootstrapSingleEntry(fynAppEntry: FederationEntry): Promise<void> {
    // Step 1: Initialize the entry
    fynAppEntry.init();
    const container = fynAppEntry.container;

    // Step 2: Load and execute config module if present
    let globalFynAppConfig = null;
    if (container && container.$E["./config"]) {
      console.debug("fynMeshKernel loading fynapp config", fynAppEntry);
      const factory = await fynAppEntry.get("./config");
      const configModule = factory();

      // Create FynApp with config
      const config = configModule.default || configModule;
      globalFynAppConfig = config; // Store for later use in main module

      if (configModule.configure) {
        configModule.configure(this, fynAppEntry);
      }
    } else if (fynAppEntry.config) {
      console.debug(
        "fynMeshKernel loading fynapp",
        container.name,
        "config from entry",
        fynAppEntry,
      );
      globalFynAppConfig = fynAppEntry.config;
    }

    // Step 3: Load and register middlewares if present
    await this.loadEntryMiddlewares(fynAppEntry);

    // Step 3.5: Scan expose modules for middleware usage and invoke middleware
    await this.scanAndApplyMiddlewareUsage(fynAppEntry);

    // Step 4: Load and execute main module if present
    if (container && container.$E["./main"]) {
      console.debug("fynMeshKernel loading fynapp main", fynAppEntry);
      const factory = await fynAppEntry.get("./main");
      const mainModule = factory();

      // Store the main module for potential middleware access
      if (mainModule && typeof mainModule === "object") {
        // Check if config was already loaded in step 2
        const appName = this.extractAppName(fynAppEntry);

        // Use the global config we stored earlier (SIMPLE FIX)
        const existingConfig = globalFynAppConfig;

        // Create a FynApp object for middleware compatibility
        const fynApp: FynApp = {
          name: appName,
          version: "1.0.0", // Default version
          mainModule: mainModule,
          middlewareConfig: existingConfig?.middlewareConfig,
        };

        // Apply middlewares to the fynapp
        await this.applyMiddlewares(fynApp);

        // Call main if it exists
        if (mainModule.main) {
          mainModule.main(this, fynApp);
        }
      }
    }

    console.debug("fynMeshKernel completed fynapp bootstrap", fynAppEntry);
  }

  /**
   * Enhanced middleware loading with better discovery
   */
  async loadEntryMiddlewares(fynAppEntry: FederationEntry): Promise<void> {
    const container = fynAppEntry.container;
    if (!container || !container.$E) return;

    const appName = this.extractAppName(fynAppEntry);
    const appVersion = container.version || "1.0.0"; // Get version from container

    console.log("fynmesh kernel: checking for middlewares in", appName);

    // Look for middleware exports
    for (const moduleName in container.$E) {
      console.log("fynmesh kernel: checking module", moduleName);
      if (moduleName.startsWith("./middleware")) {
        try {
          console.log("fynmesh kernel: loading middleware module", moduleName);
          const factory = await fynAppEntry.get(moduleName);
          const moduleExports = factory();

          // Look for middleware exports in the module
          for (const [exportName, middleware] of Object.entries(moduleExports)) {
            if (
              exportName.startsWith("__middleware__") &&
              middleware &&
              typeof middleware === "object" &&
              "name" in middleware
            ) {
              const middlewareImpl = middleware as FynAppMiddleware;

              if (middlewareImpl.setup) {
                await middlewareImpl.setup(this);
              }

              // Pass the fynApp version when registering middleware
              this.registerMiddleware(middlewareImpl, appName, appVersion);
              console.log(
                "✅ REGISTERED MIDDLEWARE:",
                `${appName}::${middlewareImpl.name}`,
                "version:",
                appVersion,
              );
              console.log("✅ CURRENT MIDDLEWARE REGISTRY:", Object.keys(this.runTime.middlewares));
            }
          }
        } catch (error) {
          console.error("Failed to load middleware module", moduleName, error);
        }
      }
    }
  }

  /**
   * Extract app name from federation entry
   */
  private extractAppName(fynAppEntry: FederationEntry): string {
    return fynAppEntry.container.name;
  }

  /**
   * Bootstrap fynapps - handles both federation entries and legacy app info
   */
  async bootstrapFynApp(appsInfo: FynAppInfo[]): Promise<void> {
    if (appsInfo.length <= 0) {
      return;
    }

    // Separate federation entries from legacy apps
    const federationApps = appsInfo.filter((appInfo) => appInfo.entry);

    // Process federation entries first
    for (const appInfo of federationApps) {
      await this.bootstrapSingleEntry(appInfo.entry!);
    }
  }

  /**
   * Apply all registered middleware to a fynapp
   */
  async applyMiddlewares(fynApp: FynApp): Promise<void> {
    const context = this.createMiddlewareContext(fynApp);

    console.log("fynmesh kernel: applying middlewares to", fynApp.name);

    // Apply ALL registered middleware to this FynApp
    console.log("fynmesh kernel: applying all registered middleware");
    console.log("🔍 AVAILABLE MIDDLEWARE:", Object.keys(this.runTime.middlewares));

    for (const middlewareKey in this.runTime.middlewares) {
      const versionMap = this.runTime.middlewares[middlewareKey];
      const versions = Object.keys(versionMap).sort();
      const latestVersion = versions[versions.length - 1];
      const middlewareMeta = versionMap[latestVersion];

      if (middlewareMeta.implementation?.apply) {
        console.log("fynmesh kernel: applying middleware", middlewareKey);

        // Get middleware-specific config from FynApp if available
        const [provider, middlewareName] = middlewareKey.split("::");
        const middlewareConfig = fynApp.middlewareConfig?.[middlewareName] || {};
        const middlewareContext = {
          ...context,
          config: middlewareConfig,
        };

        try {
          await middlewareMeta.implementation.apply(fynApp, middlewareContext);
        } catch (error) {
          console.error(`Failed to apply middleware ${middlewareKey}:`, error);
          // TODO: Add proper error handling - should we continue or fail?
        }
      }
    }
  }

  /**
   * Protected helper to build fynapp URL
   */
  protected buildFynAppUrl(baseUrl: string, entryFile: string = "fynapp-entry.js"): string {
    return urlJoin(baseUrl, entryFile);
  }

  // Abstract methods that must be implemented by platform-specific classes
  abstract loadFynApp(baseUrl: string, loadId?: string): Promise<void>;

  /**
   * List all available middleware
   */
  listMiddleware(): MiddlewareInfo[] {
    const result: MiddlewareInfo[] = [];
    for (const [middlewareKey, versionMap] of Object.entries(this.runTime.middlewares)) {
      const [provider, name] = middlewareKey.split("::");
      for (const [version, meta] of Object.entries(versionMap)) {
        result.push({
          name,
          version,
          provider,
        });
      }
    }
    return result;
  }

  /**
   * Create middleware context for FynApp
   */
  createMiddlewareContext(fynApp: FynApp): MiddlewareContext {
    return {
      config: fynApp.middlewareConfig || {},
      kernel: this,
    };
  }

  /**
   * Scan expose module exports for __middlewareInfo markers and invoke middleware
   * By default, only scans the ./main module
   */
  async scanAndApplyMiddlewareUsage(fynAppEntry: FederationEntry): Promise<void> {
    const container = fynAppEntry.container;
    if (!container || !container.$E) return;

    const appName = this.extractAppName(fynAppEntry);
    console.log("fynmesh kernel: scanning expose modules for middleware usage in", appName);

    // By default, only scan the ./main module for middleware usage
    // TODO: Future enhancement - allow config to specify additional modules to scan
    const modulesToScan = ["./main"];

    // Future: Load additional modules specified in config
    // if (fynAppConfig?.additionalModulesForMiddleware) {
    //   modulesToScan.push(...fynAppConfig.additionalModulesForMiddleware);
    // }

    for (const moduleName of modulesToScan) {
      if (!container.$E[moduleName]) {
        console.log("fynmesh kernel: module not available for scanning", moduleName);
        continue;
      }

      try {
        console.log("fynmesh kernel: scanning module for usage", moduleName);
        const factory = await fynAppEntry.get(moduleName);
        const moduleExports = factory();

        // Look for exports with __middlewareInfo field
        for (const [exportName, exportValue] of Object.entries(moduleExports)) {
          if (exportValue && typeof exportValue === "object" && "__middlewareInfo" in exportValue) {
            const usage = exportValue as MiddlewareUsage;
            console.log(
              "🔍 FOUND MIDDLEWARE USAGE:",
              exportName,
              "->",
              `${usage.__middlewareInfo.provider}::${usage.__middlewareInfo.name}`,
            );

            // Look up the middleware
            const middleware = this.getMiddleware(
              usage.__middlewareInfo.name,
              usage.__middlewareInfo.provider,
            );

            if (middleware && middleware.apply) {
              console.log(
                "✅ INVOKING MIDDLEWARE ON USAGE:",
                `${usage.__middlewareInfo.provider}::${usage.__middlewareInfo.name}`,
              );

              // Create a temporary FynApp object for this usage
              const usageFynApp: FynApp = {
                name: appName,
                version: "1.0.0",
                mainModule: { [exportName]: usage.user },
              };

              // Create middleware context with usage-specific config
              const middlewareContext: MiddlewareContext = {
                config: usage.config || {},
                kernel: this,
              };

              try {
                await middleware.apply(usageFynApp, middlewareContext);
              } catch (error) {
                console.error(
                  `Failed to apply middleware ${usage.__middlewareInfo.provider}::${usage.__middlewareInfo.name} on usage:`,
                  error,
                );
              }
            } else {
              console.warn(
                `❌ MIDDLEWARE NOT FOUND FOR USAGE: ${usage.__middlewareInfo.provider}::${usage.__middlewareInfo.name}`,
              );
              console.warn("🔍 AVAILABLE MIDDLEWARE:", Object.keys(this.runTime.middlewares));
            }
          }
        }
      } catch (error) {
        console.error("Failed to scan module for middleware usage", moduleName, error);
      }
    }
  }
}
