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
  MiddlewareLookupOptions,
} from "../types";
import { noOpTelemetry, captureEvent } from "../kernel-telemetry";
import { MIDDLEWARE_EXPORT_PREFIX } from "../util";
import { isSupportedRange, maxSatisfying } from "../semver-range";

const DummyMiddlewareReg: FynAppMiddlewareReg = {
  regKey: "",
} as FynAppMiddlewareReg;

// Aligns with FynAppMiddlewareVersionMap from types.ts
export type MiddlewareVersionMap = Record<string, FynAppMiddlewareReg> & {
  /**
   * What a lookup that asks for no version resolves to: the version that
   * registered FIRST, never re-pointed. See FynAppMiddlewareVersionMap in
   * types.ts for why first-registered was kept over highest-available, and
   * `registerMiddleware` for the warning that makes the ambiguity visible.
   */
  default?: FynAppMiddlewareReg;
};

export interface AutoApplyMiddlewares {
  fynapp: FynAppMiddlewareReg[];
  mw: FynAppMiddlewareReg[];
}

export interface MiddlewareManager {
  registerMiddleware(mwReg: FynAppMiddlewareReg): void;
  getMiddleware(
    name: string,
    provider?: string,
    opts?: MiddlewareLookupOptions
  ): FynAppMiddlewareReg;
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
  /** regKeys already warned about under FYM-332 - warn once, not once per registration. */
  const ambiguousDefaultWarned = new Set<string>();
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
    /*
     * `default` is what a lookup with no version range resolves to, and it is
     * set once, by whichever version registers first - deliberately, and kept
     * that way in FYM-332.
     *
     * First-registered is arbitrary but stable: once a page has resolved a
     * version-less lookup, every later one resolves the same way. Re-pointing
     * `default` at the highest registered version reads as the more intuitive
     * rule, but versions register as FynApps mount, so it would move `default`
     * under a page that is already running - two consumers that both asked for
     * nothing would then get different middleware depending only on when they
     * mounted. An ordering surprise you can read off the load order beats a
     * timing one you cannot reproduce, so this assignment stays conditional.
     *
     * A consumer that actually cares which version it gets asks for a range
     * (FYM-321); the `else` below makes the ambiguity audible for the ones
     * that do not.
     */
    if (!versionMap.default) {
      versionMap.default = mwReg;
    } else if (!ambiguousDefaultWarned.has(regKey)) {
      // Once per middleware, at registration - NOT at lookup. A version-less
      // lookup on a two-version page happens on every execution, and a warning
      // that repeats like that gets filtered out or deleted rather than fixed.
      //
      // Dev builds only: rollup.config.ts compresses the browser kernel with
      // terser `drop_console: true`, so this text exists in
      // fynmesh-browser-kernel.dev.js and is gone from the .min.js. Nothing
      // production-facing should be assumed to depend on seeing it.
      ambiguousDefaultWarned.add(regKey);
      const others = Object.keys(versionMap).filter(
        (key) => key !== "default" && key !== versionMap.default!.hostFynApp.version
      );
      console.warn(
        `⚠️ Middleware '${regKey}' now has more than one version registered.` +
          ` A lookup that asks for no version resolves to the first version registered` +
          ` (${versionMap.default.hostFynApp.version}), not the highest;` +
          ` also registered: ${others.join(", ")}.` +
          ` Declare a version range on the middleware to choose deliberately.`
      );
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

  /**
   * Pick, out of one middleware's version map, the registration the consumer
   * asked for (FYM-321).
   *
   * Before FYM-321 this was unconditionally `versionMap.default` - whichever
   * version registered first - even though the consumer's semver range had been
   * carried all the way from its package.json to this call site and then
   * dropped. Two versions of one middleware on a page meant every consumer
   * silently got the one that loaded first.
   *
   * The compatibility guarantee this change rests on: **with no version asked
   * for, this returns `versionMap.default` and does nothing else** - no parsing,
   * no scanning, no warning - exactly as before. Every FynApp resolving
   * middleware today takes that path, so nothing that runs today changes what
   * it runs.
   *
   * A range that nothing satisfies also still resolves to `default`. The defect
   * was the silence, not the fallback, so the fallback stays and gains a
   * warning. Resolving to nothing instead would turn pages that work today -
   * wrongly, but visibly - into blank ones; that is a separate decision for a
   * major version, deliberately not built here.
   */
  const resolveFromVersionMap = (
    versionMap: MiddlewareVersionMap,
    regKey: string,
    wanted?: string
  ): FynAppMiddlewareReg | undefined => {
    const fallback = versionMap.default;

    // The pre-FYM-321 path, untouched. `*` is what parseMiddlewareString
    // substitutes when the build wrote no range, so it means the same thing.
    if (!wanted || wanted === "*" || wanted.trim() === "") {
      return fallback;
    }

    // An exact version key needs no range machinery. Guard `default` itself:
    // it is a slot name, not a version anyone can ask for.
    if (wanted !== "default" && versionMap[wanted]) {
      return versionMap[wanted];
    }

    const registered = Object.keys(versionMap).filter((key) => key !== "default");

    if (!isSupportedRange(wanted)) {
      console.warn(
        `⚠️ Middleware '${regKey}': '${wanted}' is not a version range this kernel can read` +
          ` (registered: ${registered.join(", ") || "none"}).` +
          ` Falling back to the default version (${fallback?.hostFynApp.version ?? "none"}).`
      );
      return fallback;
    }

    const best = maxSatisfying(registered, wanted);
    if (best) {
      return versionMap[best];
    }

    console.warn(
      `⚠️ Middleware version mismatch for '${regKey}': asked for '${wanted}',` +
        ` but the registered version(s) are ${registered.join(", ") || "none"}.` +
        ` Falling back to the default version (${fallback?.hostFynApp.version ?? "none"}),` +
        ` so this FynApp will run a version of the middleware it did not ask for.`
    );

    return fallback;
  };

  return {
    registerMiddleware,

    getMiddleware(name, provider, opts) {
      const wanted = opts?.version;

      // If provider is specified, try exact match first
      if (provider) {
        const key = `${provider}::${name}`;
        const versionMap = middlewares[key];
        if (versionMap) {
          const mwReg = resolveFromVersionMap(versionMap, key, wanted);
          if (mwReg) {
            return mwReg;
          }
        }
      }
      // Fallback: scan all providers for the first one exporting this name.
      // Which provider wins here is unchanged by FYM-321 - see FYM-333.
      for (const [key, versionMap] of Object.entries(middlewares)) {
        if (key.endsWith(`::${name}`)) {
          const mwReg = resolveFromVersionMap(versionMap, key, wanted);
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
      ambiguousDefaultWarned.clear();
    },
  };
} as unknown as new (tel?: KernelTelemetry) => MiddlewareManager;
