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
} from "./types";
import type { FederationEntry } from "federation-js";
import { urlJoin } from "./util";

/**
 * Extended runtime data interface for internal use
 */
export interface KernelRuntimeData extends FynMeshRuntimeData {
  shareScope: Record<string, any>;
}

/**
 * Abstract base class for FynMesh kernel implementations
 * Contains all platform-agnostic logic
 */
export abstract class FynMeshKernelCore implements FynMeshKernel {
  public readonly events: FynEventTarget;
  public readonly version: string = "1.0.0";
  public readonly shareScopeName: string = fynMeshShareScope;

  protected runTime: KernelRuntimeData;

  constructor() {
    this.events = new FynEventTarget();
    this.runTime = {
      appsLoaded: {},
      middlewares: {},
      shareScope: Object.create(null),
    };
  }

  /**
   * Middleware registry and API implementation
   */
  public readonly middleware = {
    register: (middleware: FynAppMiddleware, provider = "unknown") => {
      this.runTime.middlewares[middleware.name] = {
        fynApp: { name: provider, version: "1.0.0" } as FynApp,
        config: {},
        moduleName: `__middleware__${middleware.name}`,
        exportName: middleware.name,
        implementation: middleware,
      };
    },

    get: <T = any>(name: string): T | undefined => {
      const middleware = this.runTime.middlewares[name];
      return middleware?.implementation as T;
    },

    has: (name: string): boolean => {
      return name in this.runTime.middlewares;
    },

    list: (): MiddlewareInfo[] => {
      return Object.entries(this.runTime.middlewares).map(([name, meta]) => ({
        name,
        version: meta.implementation.version,
        provider: meta.fynApp.name,
        implementation: meta.implementation,
      }));
    },

    createContext: (fynApp: FynApp): MiddlewareContext => {
      return {
        config: fynApp.middlewareConfig || {},
        kernel: this,
        middleware: {
          get: this.middleware.get,
          has: this.middleware.has,
          list: () => this.middleware.list().map((info) => info.name),
        },
      };
    },
  };

  /**
   * Initialize the kernel runtime data
   */
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData {
    this.runTime = {
      ...data,
      shareScope: this.runTime.shareScope, // Preserve existing shareScope
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
          middlewareRequirements: existingConfig?.middlewareRequirements,
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

    console.log("fynmesh kernel: checking for middlewares in", this.extractAppName(fynAppEntry));

    // Look for middleware exports
    for (const moduleName in container.$E) {
      console.log("fynmesh kernel: checking module", moduleName);
      if (moduleName.startsWith("./middleware/") || moduleName.startsWith("__middleware")) {
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

              this.middleware.register(middlewareImpl, this.extractAppName(fynAppEntry));
              console.log(
                "✅ REGISTERED MIDDLEWARE:",
                middlewareImpl.name,
                "from",
                this.extractAppName(fynAppEntry),
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
   * Enhanced middleware application with configuration and requirements
   */
  async applyMiddlewares(fynApp: FynApp): Promise<void> {
    const context = this.middleware.createContext(fynApp);

    console.log("fynmesh kernel: applying middlewares to", fynApp.name);

    // Apply middleware based on FynApp requirements
    const requirements = fynApp.middlewareRequirements || [];

    if (requirements.length > 0) {
      console.log("fynmesh kernel: found", requirements.length, "middleware requirements");
      console.log(
        "🔍 LOOKING FOR MIDDLEWARE:",
        requirements.map((r) => r.name),
      );
      console.log("🔍 AVAILABLE MIDDLEWARE:", Object.keys(this.runTime.middlewares));
      // Apply specific middleware requirements
      for (const requirement of requirements) {
        const middleware = this.runTime.middlewares[requirement.name];

        if (!middleware) {
          console.error(`❌ MIDDLEWARE NOT FOUND: '${requirement.name}'`);
          console.error("❌ AVAILABLE:", Object.keys(this.runTime.middlewares));
          if (requirement.required !== false) {
            throw new Error(`Required middleware '${requirement.name}' not found`);
          }
          console.warn(`Optional middleware '${requirement.name}' not available`);
          continue;
        }

        if (middleware.implementation.apply) {
          console.log("fynmesh kernel: applying middleware", requirement.name);
          const middlewareConfig = fynApp.middlewareConfig?.[requirement.name] || {};
          const middlewareContext = {
            ...context,
            config: middlewareConfig,
          };

          await middleware.implementation.apply(fynApp, middlewareContext);
        }
      }
    } else {
      // Fallback: apply all available middleware (legacy behavior)
      for (const capId in this.runTime.middlewares) {
        const middleware = this.runTime.middlewares[capId];
        if (middleware.implementation?.apply) {
          await middleware.implementation.apply(fynApp, context);
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
}
