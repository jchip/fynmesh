/**
 * Middleware Management Module
 * Handles middleware registration, versioning, and auto-apply logic
 */

import type {
  FynAppMiddleware,
  FynAppMiddlewareReg,
  FynApp,
  FynMeshRuntimeData,
  KernelTelemetry,
} from "../types";
import { noOpTelemetry, captureEvent } from "../kernel-telemetry";
import { MIDDLEWARE_EXPORT_PREFIX } from "../util";

const DummyMiddlewareReg: FynAppMiddlewareReg = {
  regKey: "",
} as FynAppMiddlewareReg;

// Aligns with FynAppMiddlewareVersionMap from types.ts
export type MiddlewareVersionMap = Record<string, FynAppMiddlewareReg> & {
  default?: FynAppMiddlewareReg;
};

export interface AutoApplyMiddlewares {
  fynapp: FynAppMiddlewareReg[];
  mw: FynAppMiddlewareReg[];
}

export interface MiddlewareManager {
  registerMiddleware(mwReg: FynAppMiddlewareReg): void;
  getMiddleware(name: string, provider?: string): FynAppMiddlewareReg;
  getAutoApply(): AutoApplyMiddlewares | undefined;
  scanAndRegisterMiddleware(fynApp: FynApp, exposeName: string, exposedModule: any): string[];
  initializeFromRuntime(runtime: FynMeshRuntimeData): void;
  exportToRuntime(): Pick<FynMeshRuntimeData, "middlewares" | "autoApply">;
  clear(): void;
}

/**
 * Built as a closure over its state rather than a class — see the note on
 * `ManifestResolver` for why: closure variables mangle to a single character
 * and unused helpers are dropped, neither of which a minifier can do to class
 * members. The cast keeps `new MiddlewareManager(tel)` working at every
 * existing call site.
 */
export const MiddlewareManager = function (telemetry?: KernelTelemetry): MiddlewareManager {
  const tel = telemetry ?? noOpTelemetry;
  const scannedModules = new Set<string>();
  let middlewares: Record<string, MiddlewareVersionMap> = {};
  let autoApply: AutoApplyMiddlewares | undefined;

  const registerMiddleware = (mwReg: FynAppMiddlewareReg): void => {
    const { regKey, hostFynApp } = mwReg;

    const versionMap = middlewares[regKey] || Object.create(null);

    // Check if this exact middleware version is already registered
    if (versionMap[hostFynApp.version]) {
      console.debug(
        `⚠️ Middleware already registered: ${regKey}@${hostFynApp.version} - skipping duplicate registration`,
      );
      return;
    }

    console.log(`🔧 Registering mw: ${regKey}, autoApplyScope:`, mwReg.mw.autoApplyScope);

    versionMap[hostFynApp.version] = mwReg;
    // set default version to the first version
    if (!versionMap.default) {
      versionMap.default = mwReg;
    }
    middlewares[regKey] = versionMap;

    const autoApplyScope = mwReg.mw.autoApplyScope || [];

    if (autoApplyScope.length > 0) {
      if (!autoApply) {
        autoApply = { fynapp: [], mw: [] };
      }

      if (autoApplyScope.includes("all") || autoApplyScope.includes("fynapp")) {
        autoApply.fynapp.push(mwReg);
      }

      if (autoApplyScope.includes("all") || autoApplyScope.includes("middleware")) {
        autoApply.mw.push(mwReg);
      }

      console.debug(`🎯 Registered auto-apply middleware for [${autoApplyScope.join(', ')}]: ${regKey}@${hostFynApp.version}`);
    } else {
      console.debug(`✅ Registered explicit-use mw: ${regKey}@${hostFynApp.version}`);
    }

    captureEvent(tel, "registered", { key: regKey, version: hostFynApp.version, autoApply: autoApplyScope.length > 0 });
  };

  const hasScannedModule = (scanCacheKey: string): boolean => scannedModules.has(scanCacheKey);

  return {
    registerMiddleware,

    getMiddleware(name, provider) {
      // If provider is specified, try exact match first
      if (provider) {
        const versionMap = middlewares[`${provider}::${name}`];
        if (versionMap) {
          const mwReg = versionMap["default"];
          if (mwReg) {
            return mwReg;
          }
        }
      }
      // Fallback: scan all providers for first available default match
      for (const [key, versionMap] of Object.entries(middlewares)) {
        if (key.endsWith(`::${name}`)) {
          const mwReg = versionMap.default;
          if (mwReg) return mwReg;
        }
      }
      return DummyMiddlewareReg;
    },

    getAutoApply: () => autoApply,

    scanAndRegisterMiddleware(fynApp, exposeName, exposedModule) {
      const scanCacheKey = `${fynApp.name}@${fynApp.version}::${exposeName}`;

      // Check if we've already scanned this module
      if (hasScannedModule(scanCacheKey)) {
        console.debug(
          `⏭️  Skipping middleware scan for '${exposeName}' - already scanned for`,
          fynApp.name,
          fynApp.version,
        );
        return [];
      }

      // Mark as scanned before processing to prevent duplicate scans
      scannedModules.add(scanCacheKey);

      const mwExports: string[] = [];

      for (const [exportName, exportValue] of Object.entries(exposedModule)) {
        if (exportName.startsWith(MIDDLEWARE_EXPORT_PREFIX)) {
          const mw = exportValue as FynAppMiddleware;
          const mwName = mw.name;
          registerMiddleware({
            regKey: `${fynApp.name}::${mwName}`,
            fullKey: `${fynApp.name}@${fynApp.version}::${mwName}`,
            hostFynApp: fynApp,
            exposeName,
            exportName,
            mw,
          });
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

      captureEvent(tel, "scan.completed", { app: fynApp.name, expose: exposeName, count: mwExports.length });

      return mwExports;
    },

    initializeFromRuntime(runtime) {
      if (runtime.middlewares) {
        middlewares = runtime.middlewares;
      }
      if (runtime.autoApply) {
        autoApply = runtime.autoApply;
      }
    },

    exportToRuntime: () => ({
      middlewares,
      autoApply: autoApply,
    }),

    clear() {
      middlewares = {};
      autoApply = undefined;
      scannedModules.clear();
    },
  };
} as unknown as new (tel?: KernelTelemetry) => MiddlewareManager;
