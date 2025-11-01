/**
 * Middleware Management Module
 * Handles middleware registration, versioning, and auto-apply logic
 */

import type {
  FynAppMiddleware,
  FynAppMiddlewareReg,
  FynApp,
  FynMeshRuntimeData,
} from "../types";

const DummyMiddlewareReg: FynAppMiddlewareReg = {
  regKey: "",
} as FynAppMiddlewareReg;

// Aligns with FynAppMiddlewareVersionMap from types.ts
export type MiddlewareVersionMap = Record<string, FynAppMiddlewareReg> & {
  default?: FynAppMiddlewareReg;
};

export interface AutoApplyMiddlewares {
  fynapp: FynAppMiddlewareReg[];
  middleware: FynAppMiddlewareReg[];
}

export class MiddlewareManager {
  private middlewares: Record<string, MiddlewareVersionMap> = {};
  private autoApplyMiddlewares?: AutoApplyMiddlewares;
  private scannedModules: Set<string> = new Set();

  /**
   * Register a middleware implementation with enhanced error handling
   */
  registerMiddleware(mwReg: FynAppMiddlewareReg): void {
    const { regKey, hostFynApp } = mwReg;

    const versionMap = this.middlewares[regKey] || Object.create(null);

    // Check if this exact middleware version is already registered
    if (versionMap[hostFynApp.version]) {
      console.debug(
        `⚠️ Middleware already registered: ${regKey}@${hostFynApp.version} - skipping duplicate registration`,
      );
      return;
    }

    console.log(`🔧 Registering middleware: ${regKey}, autoApplyScope:`, mwReg.middleware.autoApplyScope);

    versionMap[hostFynApp.version] = mwReg;
    // set default version to the first version
    if (!versionMap.default) {
      versionMap.default = mwReg;
    }
    this.middlewares[regKey] = versionMap;

    const autoApplyScope = mwReg.middleware.autoApplyScope || [];

    if (autoApplyScope.length > 0) {
      if (!this.autoApplyMiddlewares) {
        this.autoApplyMiddlewares = { fynapp: [], middleware: [] };
      }

      if (autoApplyScope.includes("all") || autoApplyScope.includes("fynapp")) {
        this.autoApplyMiddlewares.fynapp.push(mwReg);
      }

      if (autoApplyScope.includes("all") || autoApplyScope.includes("middleware")) {
        this.autoApplyMiddlewares.middleware.push(mwReg);
      }

      console.debug(`🎯 Registered auto-apply middleware for [${autoApplyScope.join(', ')}]: ${regKey}@${hostFynApp.version}`);
    } else {
      console.debug(`✅ Registered explicit-use middleware: ${regKey}@${hostFynApp.version}`);
    }
  }

  /**
   * Get middleware by name and provider
   */
  getMiddleware(name: string, provider?: string): FynAppMiddlewareReg {
    // If provider is specified, try exact match first
    if (provider) {
      const middlewareKey = `${provider}::${name}`;
      const versionMap = this.middlewares[middlewareKey];
      if (versionMap) {
        const mwReg = versionMap["default"];
        if (mwReg) {
          return mwReg;
        }
      }
    }
    // Fallback: scan all providers for first available default match
    for (const [key, versionMap] of Object.entries(this.middlewares)) {
      if (key.endsWith(`::${name}`)) {
        const mwReg = (versionMap as any)["default"];
        if (mwReg) return mwReg;
      }
    }
    return DummyMiddlewareReg;
  }

  /**
   * Get auto-apply middlewares
   */
  getAutoApplyMiddlewares(): AutoApplyMiddlewares | undefined {
    return this.autoApplyMiddlewares;
  }

  /**
   * Get middlewares for a specific FynApp type
   */
  getTargetMiddlewares(isMiddlewareProvider: boolean): FynAppMiddlewareReg[] {
    if (!this.autoApplyMiddlewares) {
      return [];
    }
    
    return isMiddlewareProvider
      ? this.autoApplyMiddlewares.middleware
      : this.autoApplyMiddlewares.fynapp;
  }

  /**
   * Check if a module has been scanned for middleware
   */
  hasScannedModule(scanCacheKey: string): boolean {
    return this.scannedModules.has(scanCacheKey);
  }

  /**
   * Mark a module as scanned for middleware
   */
  markModuleScanned(scanCacheKey: string): void {
    this.scannedModules.add(scanCacheKey);
  }

  /**
   * Scan and register middleware exports from a module
   */
  scanAndRegisterMiddleware(
    fynApp: FynApp,
    exposeName: string,
    exposedModule: any
  ): string[] {
    const scanCacheKey = `${fynApp.name}@${fynApp.version}::${exposeName}`;
    
    // Check if we've already scanned this module
    if (this.hasScannedModule(scanCacheKey)) {
      console.debug(
        `⏭️  Skipping middleware scan for '${exposeName}' - already scanned for`,
        fynApp.name,
        fynApp.version,
      );
      return [];
    }

    // Mark as scanned before processing to prevent duplicate scans
    this.markModuleScanned(scanCacheKey);

    const mwExports: string[] = [];

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
        this.registerMiddleware(mwReg);
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

    return mwExports;
  }

  /**
   * Initialize runtime with middleware data
   */
  initializeFromRuntime(runtime: FynMeshRuntimeData): void {
    if (runtime.middlewares) {
      this.middlewares = runtime.middlewares;
    }
    if (runtime.autoApplyMiddlewares) {
      this.autoApplyMiddlewares = runtime.autoApplyMiddlewares;
    }
  }

  /**
   * Export middleware state to runtime
   */
  exportToRuntime(): Pick<FynMeshRuntimeData, 'middlewares' | 'autoApplyMiddlewares'> {
    return {
      middlewares: this.middlewares,
      autoApplyMiddlewares: this.autoApplyMiddlewares,
    };
  }

  /**
   * Clear all middleware state
   */
  clear(): void {
    this.middlewares = {};
    this.autoApplyMiddlewares = undefined;
    this.scannedModules.clear();
  }
}
