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
  KernelTelemetry,
} from "../types";
import { noOpTelemetry, captureEvent } from "../kernel-telemetry";
import { FynAppRegistry } from "./fynapp-registry";
import {
  ModuleLoadError,
  KernelErrorCode,
  Result,
  ok,
  err,
} from "../errors";
import { MIDDLEWARE_EXPOSE_PREFIX, getTargetMiddlewares, findExecutionOverride, createMiddlewareCallContext, executeMiddlewareOverride } from "../util";

/**
 * Callback type for middleware scanning
 * Returns array of middleware export names that were registered
 */
export type MiddlewareScanner = (
  fynApp: FynApp,
  exposeName: string,
  exposedModule: any
) => string[];

export interface ModuleLoader {
  loadExposeModule(
    fynApp: FynApp,
    exposeName: string,
    required: boolean,
    middlewareScanner?: MiddlewareScanner
  ): Promise<Result<any, ModuleLoadError>>;
  loadMiddlewareFromDependency(
    packageName: string,
    middlewarePath: string,
    registry: FynAppRegistry,
    middlewareScanner?: MiddlewareScanner
  ): Promise<Result<void, ModuleLoadError>>;
  loadFynAppBasics(
    fynAppEntry: FynAppEntry,
    registry: FynAppRegistry,
    middlewareScanner?: MiddlewareScanner
  ): Promise<FynApp>;
  mkRuntime(fynApp: FynApp): FynUnitRuntime;
  invokeFynUnit(
    fynUnit: FynUnit,
    fynApp: FynApp,
    autoApply?: { fynapp: FynAppMiddlewareReg[]; mw: FynAppMiddlewareReg[] },
    kernel?: FynMeshKernel
  ): Promise<void>;
}



/**
 * Built as a closure over its state rather than a class — see the note on
 * `ManifestResolver`.
 */
export const ModuleLoader = function (
  telemetry?: KernelTelemetry,
  busProvider?: (fynApp: FynApp) => import("../fyn-bus").FynBus
): ModuleLoader {
  const tel = telemetry ?? noOpTelemetry;

  /**
   * Load an expose module from a FynApp
   * @param fynApp - The FynApp to load the module from
   * @param exposeName - The name of the exposed module (e.g., "./main")
   * @param loadMiddlewares - Whether to scan for and register middlewares
   * @param middlewareScanner - Callback to scan and register middleware (delegates to MiddlewareManager)
   * @returns Result with the loaded module or an error
   */
  const loadExposeModule = async (
    fynApp: FynApp,
    exposeName: string,
    loadMiddlewares?: boolean,
    middlewareScanner?: MiddlewareScanner
  ): Promise<Result<any, ModuleLoadError>> => {
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
      tel.capErr(
        "expose.not_found",
        { app: fynApp.name, expose: exposeName },
        error
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
  };

  /**
   * Load middleware from a dependency package
   * @param packageName - Name of the dependency package
   * @param middlewarePath - Path to the middleware within the package
   * @param apps - Map of loaded FynApps
   * @param middlewareScanner - Callback to scan and register middleware
   * @returns Result indicating success or error with details
   */
  const loadMiddlewareFromDependency = async (
    packageName: string,
    middlewarePath: string,
    apps: FynAppRegistry,
    middlewareScanner?: MiddlewareScanner
  ): Promise<Result<void, ModuleLoadError>> => {
    console.debug(`📦 Loading middleware from dependency: ${packageName}/${middlewarePath}`);

    // Find the dependency fynapp
    const dependencyApp = apps.get(packageName);

    if (!dependencyApp) {
      const error = new ModuleLoadError(
        KernelErrorCode.DEPENDENCY_NOT_FOUND,
        `Dependency package ${packageName} not found in runtime`,
        {
          fynAppName: packageName,
          exposeName: middlewarePath,
        }
      );
      tel.capErr(
        "dependency.not_found",
        { package: packageName, path: middlewarePath },
        error
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
    const result = await loadExposeModule(dependencyApp, exposeName, true, middlewareScanner);

    if (!result.success) {
      return err(result.error);
    }

    return ok(undefined);
  };

  /**
   * Load the basics of a FynApp
   * @param fynAppEntry - The FynApp entry point
   * @param apps - Map of loaded FynApps
   * @param middlewareScanner - Callback to scan and register middleware
   */
  const loadFynAppBasics = async (
    fynAppEntry: FynAppEntry,
    apps: FynAppRegistry,
    middlewareScanner?: MiddlewareScanner
  ): Promise<FynApp> => {
    const container = fynAppEntry.container;

    if (!container?.name || !container?.version) {
      throw new Error(`Invalid FynApp container: ${JSON.stringify(container)}`);
    }

    console.debug("🚀 Initializing FynApp entry", container.name, container.version);

    // Step 1: Initialize the entry
    fynAppEntry.init();

    captureEvent(tel, "fynapp.init", { app: container.name, version: container.version });

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
    const mainResult = await loadExposeModule(fynApp, "./main", true, middlewareScanner);
    if (!mainResult.success) {
      // Main module not found is not fatal - some FynApps may not have a main module
      console.debug(`⚠️ Main module not loaded for ${fynApp.name}: ${mainResult.error.message}`);
    }

    // Step 6: Proactively load middleware from dependencies
    //
    // `__FYNAPP_MANIFEST__` is the FynApp's manifest, embedded in its entry file
    // by the build and assigned onto the container -- read directly here, not as
    // an expose module. Same content as `dist/fynapp.manifest.json`; see
    // notes/BUILD-ARTIFACTS.md.
    //
    // This read is the one place in the kernel with NO fallback. If the embedded
    // manifest is absent, `importExposed` is undefined and the block below is
    // skipped in silence: the provider FynApps still load (buildGraph walks
    // `import-exposed` too, and that path can fall back to fetching the JSON),
    // but their middleware is never pulled out and registered. The failure then
    // surfaces at a consumer, far from here, as middleware that does not exist.
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
              console.debug(`📦 Proactively loading mw: ${packageName}/${modulePath}`);
              const depResult = await loadMiddlewareFromDependency(
                packageName,
                modulePath,
                apps,
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

    captureEvent(tel, "fynapp.basics_loaded", { app: fynApp.name, version: fynApp.version });

    // Record app in runtime registry for observability
    apps.add(fynApp);

    return fynApp;
  };

  /**
   * Create a FynUnit runtime
   * Reuses the FynApp's middlewareContext to ensure consistency across multiple runtime creations
   */
  const mkRuntime = (fynApp: FynApp): FynUnitRuntime => {
    return {
      fynApp,
      // Reuse the FynApp's middlewareContext to maintain consistency
      // This is critical for deferred loading scenarios where middlewares are resumed
      middlewareContext: fynApp.middlewareContext || new Map<string, Record<string, any>>(),
      bus: busProvider?.(fynApp),
    };
  };

  /**
   * Invoke a FynUnit
   */
  const invokeFynUnit = async (
    fynUnit: FynUnit,
    fynApp: FynApp,
    autoApply?: {
      fynapp: FynAppMiddlewareReg[];
      mw: FynAppMiddlewareReg[];
    },
    kernel?: FynMeshKernel
  ): Promise<void> => {
    const runtime = mkRuntime(fynApp);

    // Check for middleware execution overrides
    const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply);

    if (executionOverride) {
      await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel!);
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
      captureEvent(tel, "fynunit.execute", { app: fynApp.name });
      const executeResult = await fynUnit.execute(runtime);

      // Handle execution result - middleware defines contract, kernel just passes through
      if (executeResult) {
        console.debug(`📦 FynUnit returned result:`, typeof executeResult === 'object' ? executeResult.type : typeof executeResult);
      }
    }
  };

  return { loadExposeModule, loadMiddlewareFromDependency, loadFynAppBasics, mkRuntime, invokeFynUnit };
} as unknown as new (
  telemetry?: KernelTelemetry,
  busProvider?: (fynApp: FynApp) => import("../fyn-bus").FynBus
) => ModuleLoader;
