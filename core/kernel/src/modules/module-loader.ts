/**
 * Module Loading Module
 * Handles FynApp module loading and execution
 */

import type {
  FynApp,
  FynAppEntry,
  FynUnit,
  FynUnitRuntime,
  KernelHooks,
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

/** Called for each expose module loaded and recorded on its FynApp. */
export type ExposeHandler = (
  fynApp: FynApp,
  exposeName: string,
  exposedModule: any
) => void;

/** The kernel hooks the loader runs. */
export type LoaderHooks = Pick<KernelHooks, "basicsLoaded" | "runtime">;

export interface ModuleLoader {
  loadExposeModule(
    fynApp: FynApp,
    exposeName: string,
    record: boolean,
    onExpose?: ExposeHandler
  ): Promise<Result<any, ModuleLoadError>>;
  loadFynAppBasics(
    fynAppEntry: FynAppEntry,
    registry: FynAppRegistry,
    onExpose?: ExposeHandler
  ): Promise<FynApp>;
  mkRuntime(fynApp: FynApp): FynUnitRuntime;
  invokeFynUnit(fynUnit: FynUnit, fynApp: FynApp): Promise<void>;
}



/**
 * Built as a closure over its state rather than a class — see the note on
 * `ManifestResolver`.
 */
export const ModuleLoader = function (
  telemetry?: KernelTelemetry,
  hooks?: LoaderHooks
): ModuleLoader {
  const tel = telemetry ?? noOpTelemetry;

  /**
   * Load an expose module from a FynApp
   * @param fynApp - The FynApp to load the module from
   * @param exposeName - The name of the exposed module (e.g., "./main")
   * @param record - Whether to record the module on the FynApp and run onExpose
   * @param onExpose - Called with the recorded module (add-ons scan it, e.g. for middleware)
   * @returns Result with the loaded module or an error
   */
  const loadExposeModule = async (
    fynApp: FynApp,
    exposeName: string,
    record?: boolean,
    onExpose?: ExposeHandler
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

    if (record && exposedModule && typeof exposedModule === "object") {
      onExpose?.(fynApp, exposeName, exposedModule);

      fynApp.exposes[exposeName] = exposedModule;
      if ((exposedModule as any).__name) {
        fynApp.exposes[(exposedModule as any).__name] = exposedModule;
      }

      return ok(exposedModule);
    }

    // Module loaded but not recorded
    return ok(exposedModule);
  };

  /**
   * Load the basics of a FynApp
   * @param fynAppEntry - The FynApp entry point
   * @param apps - Map of loaded FynApps
   * @param onExpose - Called for each recorded expose module
   */
  const loadFynAppBasics = async (
    fynAppEntry: FynAppEntry,
    apps: FynAppRegistry,
    onExpose?: ExposeHandler
  ): Promise<FynApp> => {
    const container = fynAppEntry.container;

    if (!container?.name || !container?.version) {
      throw new Error(`Invalid FynApp container: ${JSON.stringify(container)}`);
    }

    // Step 1: Initialize the entry, unless federation already did.
    //
    // A container keeps its share scope for the life of the page — federation-js
    // exposes no teardown, so shutdownFynApp can only clear kernel-side state.
    // Re-loading a shut-down app therefore hands back an initialized container,
    // and calling init() again only warns: Container._mfInit returns undefined
    // once $SS is set, which makes the generated entry skip re-registering its
    // shares and exposes and return the existing scope. Skipping the call here
    // reaches the same state without the warning. init() is typed void, so
    // nothing consumes what it would have returned.
    if (container.$SS) {
      console.debug("🚀 FynApp entry already initialized", container.name, container.version);
    } else {
      console.debug("🚀 Initializing FynApp entry", container.name, container.version);
      fynAppEntry.init();
    }

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
    const mainResult = await loadExposeModule(fynApp, "./main", true, onExpose);
    if (!mainResult.success) {
      // Main module not found is not fatal - some FynApps may not have a main module
      console.debug(`⚠️ Main module not loaded for ${fynApp.name}: ${mainResult.error.message}`);
    }

    // Step 6: Let add-ons finish the basics (middleware pulls in the
    // middleware its dependencies expose).
    for (const h of hooks?.basicsLoaded ?? []) {
      await h(fynApp);
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
    const runtime: FynUnitRuntime = {
      fynApp,
      // Reuse the FynApp's middlewareContext to maintain consistency
      // This is critical for deferred loading scenarios where middlewares are resumed
      middlewareContext: fynApp.middlewareContext || new Map<string, Record<string, any>>(),
    };
    for (const h of hooks?.runtime ?? []) {
      h(fynApp, runtime);
    }
    return runtime;
  };

  /**
   * Invoke a FynUnit: initialize, then execute
   */
  const invokeFynUnit = async (fynUnit: FynUnit, fynApp: FynApp): Promise<void> => {
    const runtime = mkRuntime(fynApp);

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

  return { loadExposeModule, loadFynAppBasics, mkRuntime, invokeFynUnit };
} as unknown as new (
  telemetry?: KernelTelemetry,
  hooks?: LoaderHooks
) => ModuleLoader;
