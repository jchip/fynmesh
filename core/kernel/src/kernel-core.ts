/**
 * FynMesh Kernel Core - Refactored Version
 * Now using extracted modules for better maintainability
 */

import { FynEventTarget } from "./event-target";
import { fynMeshShareScope } from "./share-scope";
import { urlJoin, MIDDLEWARE_EXPOSE_PREFIX } from "./util";
import { MiddlewareStateRegistry } from "./middleware-state-registry";

// Import extracted modules
import { ManifestResolver } from "./modules/manifest-resolver";
import { BootstrapCoordinator } from "./modules/bootstrap-coordinator";
import { MiddlewareManager } from "./modules/middleware-manager";
import { ModuleLoader } from "./modules/module-loader";
import { MiddlewareExecutor } from "./modules/middleware-executor";
import { FynAppRegistry } from "./modules/fynapp-registry";

import type {
  FynMeshKernel,
  FynAppMiddleware,
  FynMeshRuntimeData,
  FynApp,
  FynAppEntry,
  FynUnit,
  FynAppMiddlewareReg,
  FynAppMiddlewareCallContext,
  FynUnitRuntime,
  RegistryResolver,
  KernelConfig,
  KernelTelemetry,
  TelemetryConfig,
} from "./types";
import { KernelTelemetryImpl, noOpTelemetry } from "./kernel-telemetry";

/**
 * Abstract base class for FynMesh kernel implementations
 * Now using modular architecture with extracted components
 */
export abstract class FynMeshKernelCore implements FynMeshKernel {
  public readonly events: FynEventTarget;
  public readonly version: string = "1.0.0";
  public readonly shareScopeName: string = fynMeshShareScope;

  protected runTime: FynMeshRuntimeData;

  // Middleware state registries
  private globalMiddlewareRegistry = new MiddlewareStateRegistry();
  private regionRegistries: Map<string, MiddlewareStateRegistry> = new Map();

  // Telemetry
  public telemetry: KernelTelemetry;

  // Extracted modules
  public manifestResolver: ManifestResolver;
  public bootstrapCoordinator: BootstrapCoordinator;
  public middlewareManager: MiddlewareManager;
  public moduleLoader: ModuleLoader;
  public middlewareExecutor: MiddlewareExecutor;
  public fynAppRegistry: FynAppRegistry;

  constructor(telemetryConfig?: TelemetryConfig) {
    this.events = new FynEventTarget();
    this.runTime = {
      appsLoaded: {},
      middlewares: {},
    };
    this.fynAppRegistry = new FynAppRegistry(this.runTime.appsLoaded);

    // Initialize telemetry
    this.telemetry = telemetryConfig
      ? new KernelTelemetryImpl(telemetryConfig)
      : noOpTelemetry;

    // Initialize extracted modules with scoped telemetry
    this.manifestResolver = new ManifestResolver(this.telemetry.scope("manifest"));
    this.bootstrapCoordinator = new BootstrapCoordinator(this.events, undefined, this.telemetry.scope("bootstrap"));
    this.middlewareManager = new MiddlewareManager(this.telemetry.scope("middleware"));
    this.moduleLoader = new ModuleLoader(this.telemetry.scope("loader"));
    this.middlewareExecutor = new MiddlewareExecutor(this.telemetry.scope("executor"));

    // Set up event handlers
    this.events.on("MIDDLEWARE_READY", (event: Event) => {
      this.handleMiddlewareReady(event as CustomEvent);
    });
  }

  /**
   * Send an event to the kernel
   */
  async emitAsync(event: CustomEvent): Promise<boolean> {
    return this.events.dispatchEvent(event);
  }

  /**
   * Install a registry resolver (browser: demo server paths)
   */
  setRegistryResolver(resolver: RegistryResolver): void {
    this.manifestResolver.setRegistryResolver(resolver);
  }

  /**
   * Set callback for preloading entry files
   */
  setPreloadCallback(callback: (url: string, depth: number) => void): void {
    this.manifestResolver.setPreloadCallback(callback);
  }

  /**
   * Programmatic API for middlewares to signal readiness
   */
  async signalMiddlewareReady(
    cc: FynAppMiddlewareCallContext,
    detail: { name?: string; status?: string; share?: any } = {},
  ): Promise<void> {
    const event = new CustomEvent("MIDDLEWARE_READY", {
      detail: {
        name: detail.name || cc.reg.middleware.name,
        status: detail.status || "ready",
        share: detail.share,
        cc,
      },
    });
    await this.emitAsync(event);
  }

  /**
   * Handle middleware ready event
   */
  private async handleMiddlewareReady(event: CustomEvent): Promise<void> {
    const { name, status, cc, share } = event.detail;
    const _share = share || {};

    // Use middleware executor to process ready middleware
    const { resumes } = this.middlewareExecutor.processReadyMiddleware(
      cc.reg.fullKey,
      _share
    );

    // Resume any deferred middleware calls
    for (const resume of resumes) {
      await this.middlewareExecutor.callMiddlewares(
        resume.callContexts,
        {
          signalReady: async (cc, share) => this.signalMiddlewareReady(cc, { share }),
          providerModeRegistrar: (fynAppName, middlewareName, mode) =>
            this.bootstrapCoordinator.registerProviderMode(fynAppName, middlewareName, mode),
          autoApplyMiddlewares: this.runTime.autoApplyMiddlewares,
          skipFynUnit: resume.resumeMode === "middleware_only" ? true : undefined,
        }
      );
    }

    console.debug(
      `✅ Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`,
    );
  }

  /**
   * Load FynApps by name using manifests and dependency graph
   */
  async loadFynAppsByName(
    requests: Array<{ name: string; range?: string }>,
    options?: import("./types").LoadFynAppsOptions
  ): Promise<void> {
    this.telemetry.capture({ type: "event", name: "load_batch.started", data: { count: requests.length } });

    // Preload initial FynApp entry files before building dependency graph
    // This allows the initial batch to start loading in parallel
    const preloadCallback = this.manifestResolver.getPreloadCallback();
    const registryResolver = this.manifestResolver.getRegistryResolver();
    if (preloadCallback && registryResolver) {
      for (const req of requests) {
        const res = await registryResolver(req.name, req.range);
        const distBase = this.manifestResolver.getDistBase(res);
        const entryUrl = `${distBase}fynapp-entry.js`;
        preloadCallback(entryUrl, 0); // depth 0 for requested FynApps
      }
    }

    const graph = await this.manifestResolver.buildGraph(requests);
    const batches = this.manifestResolver.topoBatches(graph);
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 8));
    const allMeta = this.manifestResolver.getAllNodeMeta();

    for (const batch of batches) {
      // Derive baseUrl from nodeMeta
      const tasks = batch.map((key) => {
        const meta = allMeta.get(key)!;
        const baseUrl = meta.distBase || meta.manifestUrl.replace(/\/[^/]*$/, "/");
        return async () => {
          console.debug(`📦 Loading ${meta.name}@${meta.version} from ${baseUrl}`);
          await this.loadFynApp(baseUrl);
        };
      });

      // Simple concurrency limiting
      let i = 0;
      const runners = new Array(Math.min(concurrency, tasks.length)).fill(0).map(async () => {
        while (i < tasks.length) {
          const t = tasks[i++];
          await t();
        }
      });
      await Promise.all(runners);
    }

    this.telemetry.capture({ type: "event", name: "load_batch.completed" });
  }

  /**
   * Register a middleware implementation
   */
  registerMiddleware(mwReg: FynAppMiddlewareReg): void {
    this.middlewareManager.registerMiddleware(mwReg);
    // Update runtime
    const exported = this.middlewareManager.exportToRuntime();
    this.runTime.middlewares = exported.middlewares;
    this.runTime.autoApplyMiddlewares = exported.autoApplyMiddlewares;
  }

  /**
   * Get middleware by name and provider
   */
  getMiddleware(name: string, provider?: string): FynAppMiddlewareReg {
    return this.middlewareManager.getMiddleware(name, provider);
  }

  /**
   * Get middleware state registry for global or region scope
   */
  getMiddlewareRegistry(scope: "global" | { region: string }): MiddlewareStateRegistry {
    if (scope === "global") {
      return this.globalMiddlewareRegistry;
    }

    const regionId = scope.region;
    if (!this.regionRegistries.has(regionId)) {
      this.regionRegistries.set(
        regionId,
        this.globalMiddlewareRegistry.createScope()
      );
    }
    return this.regionRegistries.get(regionId)!;
  }

  /**
   * Initialize the kernel runtime data
   */
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData {
    this.runTime = { ...data };
    this.fynAppRegistry.initialize(this.runTime.appsLoaded);
    this.middlewareManager.initializeFromRuntime(data);
    return this.runTime;
  }

  /**
   * Clean up a container name to ensure it's a valid identifier
   */
  cleanContainerName(name: string): string {
    return name.replace(/[\@\-./]/g, "_").replace(/^_*/, "");
  }

  /**
   * Create middleware scanner callback that delegates to MiddlewareManager
   * This is the single source of truth for middleware scanning
   */
  protected createMiddlewareScanner(): (fynApp: FynApp, exposeName: string, exposedModule: any) => string[] {
    return (fynApp, exposeName, exposedModule) =>
      this.middlewareManager.scanAndRegisterMiddleware(fynApp, exposeName, exposedModule);
  }

  /**
   * Load FynApp basics
   */
  async loadFynAppBasics(fynAppEntry: FynAppEntry): Promise<FynApp> {
    return this.moduleLoader.loadFynAppBasics(
      fynAppEntry,
      this.fynAppRegistry,
      this.createMiddlewareScanner()
    );
  }

  /**
   * Check if a FynApp is already loaded by examining the registry
   * Returns the existing FynApp instance if found, null otherwise
   */
  protected checkAlreadyLoaded(fynAppEntry: FynAppEntry): FynApp | null {
    const fynAppName = fynAppEntry.container?.name;
    const fynAppVersion = fynAppEntry.container?.version;
    const fynAppKey = fynAppName && fynAppVersion ? `${fynAppName}@${fynAppVersion}` : fynAppName;
    if (fynAppKey && this.fynAppRegistry.has(fynAppKey)) {
      console.debug(`✅ FynApp ${fynAppKey} already loaded, returning existing instance`);
      return this.fynAppRegistry.get(fynAppKey)!;
    }
    return null;
  }

  /**
   * Validate and normalize a main export into a FynUnit
   * - Functions are wrapped as { execute: fn }
   * - Objects with execute method pass through
   * - Invalid exports throw descriptive errors
   */
  private validateFynUnit(mainExport: any, fynAppName: string): FynUnit {
    if (typeof mainExport === "function") {
      // Path 1: Simple function - wrap as FynUnit
      return { execute: mainExport };
    }
    if (mainExport && typeof mainExport.execute === "function") {
      // Path 2: Object with execute method - valid FynUnit
      return mainExport as FynUnit;
    }
    throw new Error(
      `${fynAppName}: main export must be a function or have an execute method. ` +
      `Got: ${typeof mainExport}${mainExport ? ` with keys: ${Object.keys(mainExport).join(", ")}` : ""}`
    );
  }

  /**
   * Check bootstrap readiness and handle deferral if needed
   * Returns true if bootstrap should proceed, false if it should be skipped
   */
  private async checkBootstrapReadiness(fynApp: FynApp): Promise<boolean> {
    // Check if can bootstrap or need to defer
    if (!this.bootstrapCoordinator.canBootstrap(fynApp)) {
      console.debug(`⏸️ Deferring bootstrap of ${fynApp.name}`);
      await this.bootstrapCoordinator.deferBootstrap(fynApp);
      console.debug(`▶️ Resuming bootstrap of ${fynApp.name}`);
    }

    // Acquire bootstrap lock (must succeed to preserve serialization)
    if (!this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name)) {
      console.debug(`⏸️ Deferring bootstrap of ${fynApp.name} (bootstrap lock busy)`);
      await this.bootstrapCoordinator.deferBootstrap(fynApp);
      console.debug(`▶️ Resuming bootstrap of ${fynApp.name} (retry lock acquisition)`);
      if (!this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name)) {
        console.error(`⏰ ${fynApp.name} unable to acquire bootstrap lock after deferral; skipping bootstrap`);
        return false;
      }
    }

    return true;
  }

  /**
   * Load all middleware modules exposed by a FynApp
   */
  private async loadMiddlewareModules(fynApp: FynApp): Promise<void> {
    const middlewareScanner = this.createMiddlewareScanner();
    for (const exposeName of Object.keys(fynApp.entry.container.$E)) {
      if (exposeName.startsWith(MIDDLEWARE_EXPOSE_PREFIX)) {
        await this.moduleLoader.loadExposeModule(
          fynApp,
          exposeName,
          true,
          middlewareScanner
        );
      }
    }
  }

  /**
   * Prepare the main export for execution: validate it, apply auto-scope middlewares,
   * and return the validated FynUnit
   * Returns null if no main export exists (middleware-only FynApp)
   */
  private async prepareMainExport(fynApp: FynApp): Promise<FynUnit | null> {
    const mainExport = fynApp.exposes["./main"]?.main;
    if (!mainExport) {
      return null;
    }

    console.debug("🚀 Bootstrapping FynApp", fynApp.name, fynApp.version);

    // Validate and normalize to FynUnit
    const fynUnit = this.validateFynUnit(mainExport, fynApp.name);

    // Apply auto-scope middlewares
    const middlewareErrors = await this.middlewareExecutor.applyAutoScopeMiddlewares(
      fynApp,
      fynUnit,
      this,
      this.middlewareManager.getAutoApplyMiddlewares(),
      () => this.moduleLoader.createFynUnitRuntime(fynApp),
      async (cc, share) => this.signalMiddlewareReady(cc, { share })
    );

    // Log middleware errors but don't fail bootstrap - middleware issues shouldn't break the app
    if (middlewareErrors.length > 0) {
      console.warn(`⚠️ ${middlewareErrors.length} middleware error(s) during bootstrap of ${fynApp.name}:`,
        middlewareErrors.map(e => e.toDetailedString()));
    }

    return fynUnit;
  }

  /**
   * Execute a FynUnit directly (Path B: no explicit middleware meta)
   */
  private async executeFynUnit(fynUnit: FynUnit, fynApp: FynApp): Promise<void> {
    await this.moduleLoader.invokeFynUnit(
      fynUnit,
      fynApp,
      this.middlewareManager.getAutoApplyMiddlewares(),
      this
    );
  }

  /**
   * Bootstrap a fynapp
   */
  async bootstrapFynApp(fynApp: FynApp): Promise<void> {
    // Check readiness and acquire lock
    if (!await this.checkBootstrapReadiness(fynApp)) {
      return;
    }

    this.telemetry.capture({ type: "event", name: "bootstrap.started", data: { app: fynApp.name, version: fynApp.version } });

    try {
      // Load middleware modules for all FynApps
      await this.loadMiddlewareModules(fynApp);

      // Prepare and validate main export
      const fynUnit = await this.prepareMainExport(fynApp);

      if (fynUnit) {
        // Simplified 2-path execution:
        // Path A: FynUnit with non-empty __middlewareMeta - full middleware coordination
        // Path B: FynUnit without __middlewareMeta or empty array - direct execution with auto-apply only
        // FYM-99: Check for non-empty array to avoid skipping FynUnit execution
        if (fynUnit.__middlewareMeta && fynUnit.__middlewareMeta.length > 0) {
          // Path A: Full middleware coordination
          const middlewareScanner = this.createMiddlewareScanner();
          await this.middlewareExecutor.useMiddlewareOnFynUnit(
            fynUnit,
            fynApp,
            this,
            () => this.moduleLoader.createFynUnitRuntime(fynApp),
            (name, provider) => this.getMiddleware(name, provider),
            async (packageName, middlewarePath) => {
              await this.moduleLoader.loadMiddlewareFromDependency(
                packageName,
                middlewarePath,
                this.fynAppRegistry,
                middlewareScanner
              );
            },
            this.middlewareManager.getAutoApplyMiddlewares()
          );
        } else {
          // Path B: Direct execution with auto-apply middleware only
          await this.executeFynUnit(fynUnit, fynApp);
        }
      }

      console.debug("✅ FynApp bootstrapped", fynApp.name, fynApp.version);

      this.telemetry.capture({ type: "event", name: "bootstrap.completed", data: { app: fynApp.name, version: fynApp.version } });

      // Emit bootstrap complete event
      await this.emitAsync(
        new CustomEvent("FYNAPP_BOOTSTRAPPED", {
          detail: { name: fynApp.name, version: fynApp.version },
        })
      );
    } catch (error) {
      this.telemetry.captureError("bootstrap.failed", { app: fynApp.name }, error);

      // Error isolation: Log error but don't crash the kernel
      console.error(`❌ Bootstrap failed for ${fynApp.name}:`, error);

      // Emit failure event so other systems can react
      await this.emitAsync(
        new CustomEvent("FYNAPP_BOOTSTRAP_FAILED", {
          detail: { name: fynApp.name, version: fynApp.version, error },
        })
      );

      // Release lock so other FynApps can continue - party goes on!
      this.bootstrapCoordinator.releaseBootstrapLock();

      // Don't rethrow - allow other FynApps to bootstrap
      // The error has been logged and an event emitted for observability
    }
  }

  /**
   * Shutdown a FynApp - calls shutdown() on its FynUnits and removes from registry
   * @param name - Can be either "name" or "name@version" format
   */
  async shutdownFynApp(name: string): Promise<boolean> {
    const fynApp = this.fynAppRegistry.get(name);
    if (!fynApp) {
      console.debug(`⚠️ shutdownFynApp: FynApp "${name}" not found`);
      return false;
    }

    console.debug(`🛑 Shutting down FynApp ${name}`);

    this.telemetry.capture({ type: "event", name: "shutdown.started", data: { app: name } });

    try {
      // Call shutdown on each FynUnit that has it
      for (const exposeName of Object.keys(fynApp.exposes)) {
        const fynUnit = fynApp.exposes[exposeName]?.main;
        if (fynUnit?.shutdown) {
          const runtime = this.moduleLoader.createFynUnitRuntime(fynApp);
          await fynUnit.shutdown(runtime);
        }
      }

      // Remove from registry (both versioned and unversioned keys)
      this.removeFromRegistry(fynApp, name);

      // Emit shutdown event
      await this.emitAsync(
        new CustomEvent("FYNAPP_SHUTDOWN", {
          detail: { name: fynApp.name, version: fynApp.version },
        })
      );

      this.telemetry.capture({ type: "event", name: "shutdown.completed", data: { app: fynApp.name, version: fynApp.version } });

      console.debug(`✅ FynApp ${fynApp.name}@${fynApp.version} shutdown complete`);
      return true;
    } catch (error) {
      this.telemetry.captureError("shutdown.failed", { app: name }, error);

      console.error(`❌ Error during shutdown of ${name}:`, error);
      // Still remove from registry even if shutdown fails
      this.removeFromRegistry(fynApp, name);
      return false;
    }
  }

  /**
   * Remove a FynApp from the registry by all its keys
   * - the lookup name (could be name or name@version)
   * - the versioned key (name@version)
   * - the canonical name (fynApp.name)
   */
  private removeFromRegistry(fynApp: FynApp, name: string): void {
    this.fynAppRegistry.remove(fynApp, name);
  }

  /**
   * Protected helper to build fynapp URL
   */
  protected buildFynAppUrl(baseUrl: string, entryFile: string = "fynapp-entry.js"): string {
    return urlJoin(baseUrl, entryFile);
  }

  // Abstract methods that must be implemented by platform-specific classes
  abstract loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null>;
}
