/**
 * FynMesh Kernel Core - Refactored Version
 * Now using extracted modules for better maintainability
 */

import { FynEventTarget } from "./event-target";
import { fynMeshShareScope } from "./share-scope";
import { urlJoin, MIDDLEWARE_EXPOSE_PREFIX } from "./util";
import { MiddlewareStateRegistry } from "./middleware-state-registry";
import { FynBusRoot, type FynBus } from "./fyn-bus";

// Import extracted modules
import { ManifestResolver } from "./modules/manifest-resolver";
import { BootstrapCoordinator } from "./modules/bootstrap-coordinator";
import { MiddlewareManager } from "./modules/middleware-manager";
import { ModuleLoader } from "./modules/module-loader";
import { MiddlewareExecutor } from "./modules/middleware-executor";
import { FynAppRegistry } from "./modules/fynapp-registry";
import { FynAppLifecycle } from "./modules/fynapp-lifecycle";

import type {
  FynMeshKernel,
  FynAppMiddleware,
  FynMeshRuntimeData,
  FynApp,
  FynAppEntry,
  FynAppState,
  FynAppStatus,
  FynUnit,
  FynAppMiddlewareReg,
  FynAppMiddlewareCallContext,
  FynUnitRuntime,
  RegistryResolver,
  KernelConfig,
  KernelTelemetry,
  TelemetryConfig,
} from "./types";
import { KernelTelemetryImpl, noOpTelemetry, captureEvent } from "./kernel-telemetry";
import { KERNEL_VERSION } from "./kernel-version";

/**
 * Abstract base class for FynMesh kernel implementations
 * Now using modular architecture with extracted components
 */
export abstract class FynMeshKernelCore implements FynMeshKernel {
  public readonly events: FynEventTarget;
  public readonly version: string = KERNEL_VERSION;
  public readonly shareScopeName: string = fynMeshShareScope;

  /** Inter-FynApp messaging (see notes/FYNBUS_DESIGN.md) */
  public readonly bus: FynBus;
  protected busRoot: FynBusRoot;

  protected runTime: FynMeshRuntimeData;

  // Middleware state registries
  #globalMiddlewareRegistry = new MiddlewareStateRegistry();
  #regionRegistries: Map<string, MiddlewareStateRegistry> = new Map();

  // Telemetry
  public tel: KernelTelemetry;

  // Extracted modules
  public manifestResolver: ManifestResolver;
  public bootstrapCoordinator: BootstrapCoordinator;
  public mwMgr: MiddlewareManager;
  public loader: ModuleLoader;
  public middlewareExecutor: MiddlewareExecutor;
  public fynAppRegistry: FynAppRegistry;
  public fynAppLifecycle: FynAppLifecycle;

  constructor(telemetryConfig?: TelemetryConfig) {
    this.events = new FynEventTarget();
    this.runTime = {
      apps: {},
      middlewares: {},
    };
    this.fynAppRegistry = new FynAppRegistry(this.runTime.apps);
    this.fynAppLifecycle = new FynAppLifecycle();

    // Initialize telemetry
    this.tel = telemetryConfig
      ? new KernelTelemetryImpl(telemetryConfig)
      : noOpTelemetry;

    // Initialize FynBus (separate from this.events, which stays lifecycle-only)
    this.busRoot = new FynBusRoot(this.tel.scope("bus"));
    this.bus = this.busRoot.forKernel();

    // Initialize extracted modules with scoped telemetry
    this.manifestResolver = new ManifestResolver(this.tel.scope("manifest"));
    this.bootstrapCoordinator = new BootstrapCoordinator(this.events, undefined, this.tel.scope("bootstrap"));
    this.mwMgr = new MiddlewareManager(this.tel.scope("middleware"));
    this.loader = new ModuleLoader(
      this.tel.scope("loader"),
      (fynApp) => this.busRoot.forApp(fynApp.name, fynApp.version),
    );
    this.middlewareExecutor = new MiddlewareExecutor(this.tel.scope("executor"));

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

  /** Auto-apply middleware lists, as the executor and loader expect them. */
  #autoApply() {
    return this.mwMgr.getAutoApply();
  }

  /** Fresh FynUnit runtime for a FynApp. */
  #runtimeFor(fynApp: FynApp): FynUnitRuntime {
    return this.loader.mkRuntime(fynApp);
  }

  /** Telemetry payload identifying a FynApp. */
  #appData(fynApp: FynApp) {
    return { app: fynApp.name, version: fynApp.version };
  }

  /** Drop the app's bus subscriptions and handlers. */
  #disposeBus(fynApp: FynApp): void {
    this.busRoot.disposeApp(fynApp.name, fynApp.version);
  }

  /**
   * Invoke a FynUnit lifecycle hook on every expose that implements it.
   * shutdown/suspend/resume all walk the exposes the same way and differ only
   * in which hook they look for.
   */
  async #callUnitHook(fynApp: FynApp, hook: "shutdown" | "suspend" | "resume"): Promise<void> {
    for (const exposeName of Object.keys(fynApp.exposes)) {
      const fynUnit = fynApp.exposes[exposeName]?.main;
      const fn = fynUnit?.[hook];
      if (typeof fn === "function") {
        await fn.call(fynUnit, this.#runtimeFor(fynApp));
      }
    }
  }

  /**
   * Emit a FynApp lifecycle event. Every one of them identifies the app the
   * same way — by name and version — so only the event type and any extra
   * detail vary.
   */
  #emitLifecycle(type: string, fynApp: FynApp, extra?: Record<string, unknown>): Promise<boolean> {
    return this.emitAsync(
      new CustomEvent(type, {
        detail: { name: fynApp.name, version: fynApp.version, ...extra },
      })
    );
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
        name: detail.name || cc.reg.mw.name,
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
          autoApply: this.runTime.autoApply,
          skipFynUnit: resume.resumeMode === "middleware_only" ? true : undefined,
        }
      );
    }

    console.debug(
      `✅ Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`,
    );
  }

  /**
   * Load FynApps by name using manifests and a dependency graph.
   *
   * Throws on structural errors (no registry resolver configured, dependency
   * graph build failures). Per-app load failures are isolated — a `null` result
   * from `loadFynApp` does not abort the batch. See
   * `FynMeshKernel.loadFynAppsByName` for the full error contract.
   */
  async loadFynAppsByName(
    requests: Array<{ name: string; range?: string }>,
    options?: import("./types").LoadFynAppsOptions
  ): Promise<void> {
    captureEvent(this.tel, "load_batch.started", { count: requests.length });

    await this.manifestResolver.warmPreload(requests);

    const graph = await this.manifestResolver.buildGraph(requests);
    const batches = this.manifestResolver.topoBatches(graph);
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 8));
    const allMeta = this.manifestResolver.nodeMeta;

    for (const batch of batches) {
      // Bounded-concurrency walk over the batch. Workers share one cursor, so
      // each key is claimed once; there is no need to materialise a closure per
      // key first — the worker derives the baseUrl from nodeMeta as it goes.
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
          while (next < batch.length) {
            const meta = allMeta.get(batch[next++])!;
            const baseUrl = meta.distBase || meta.url.replace(/\/[^/]*$/, "/");
            console.debug(`📦 Loading ${meta.name}@${meta.version} from ${baseUrl}`);
            await this.loadFynApp(baseUrl);
          }
        })
      );
    }

    this.tel.capture({ type: "event", name: "load_batch.completed" });
  }

  /**
   * Register a middleware implementation
   */
  registerMiddleware(mwReg: FynAppMiddlewareReg): void {
    this.mwMgr.registerMiddleware(mwReg);
    // Update runtime
    const exported = this.mwMgr.exportToRuntime();
    this.runTime.middlewares = exported.middlewares;
    this.runTime.autoApply = exported.autoApply;
  }

  /**
   * Get middleware by name and provider
   */
  getMiddleware(name: string, provider?: string): FynAppMiddlewareReg {
    return this.mwMgr.getMiddleware(name, provider);
  }

  /**
   * Get middleware state registry for global or region scope
   */
  getMiddlewareRegistry(scope: "global" | { region: string }): MiddlewareStateRegistry {
    if (scope === "global") {
      return this.#globalMiddlewareRegistry;
    }

    const regionId = scope.region;
    if (!this.#regionRegistries.has(regionId)) {
      this.#regionRegistries.set(
        regionId,
        this.#globalMiddlewareRegistry.createScope()
      );
    }
    return this.#regionRegistries.get(regionId)!;
  }

  /**
   * Initialize the kernel runtime data
   */
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData {
    this.runTime = { ...data };
    this.fynAppRegistry.initialize(this.runTime.apps);
    this.mwMgr.initializeFromRuntime(data);
    return this.runTime;
  }

  /**
   * Create middleware scanner callback that delegates to MiddlewareManager
   * This is the single source of truth for middleware scanning
   */
  protected createMiddlewareScanner(): (fynApp: FynApp, exposeName: string, exposedModule: any) => string[] {
    return (fynApp, exposeName, exposedModule) =>
      this.mwMgr.scanAndRegisterMiddleware(fynApp, exposeName, exposedModule);
  }

  /**
   * Load FynApp basics
   */
  async loadFynAppBasics(fynAppEntry: FynAppEntry): Promise<FynApp> {
    return this.loader.loadFynAppBasics(
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
        await this.loader.loadExposeModule(
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
      this.#autoApply(),
      () => this.#runtimeFor(fynApp),
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
    await this.loader.invokeFynUnit(
      fynUnit,
      fynApp,
      this.#autoApply(),
      this
    );
  }

  /**
   * Bootstrap a fynapp
   */
  async bootstrapFynApp(fynApp: FynApp): Promise<void> {
    // Mount tracking: record that bootstrap is in progress (may be deferred
    // by the readiness check while waiting on provider FynApps).
    this.fynAppLifecycle.set(fynApp.name, fynApp.version, "bootstrapping");

    // Check readiness and acquire lock
    if (!await this.checkBootstrapReadiness(fynApp)) {
      return;
    }

    captureEvent(this.tel, "bootstrap.started", this.#appData(fynApp));

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
            () => this.#runtimeFor(fynApp),
            (name, provider) => this.getMiddleware(name, provider),
            async (packageName, middlewarePath) => {
              await this.loader.loadMiddlewareFromDependency(
                packageName,
                middlewarePath,
                this.fynAppRegistry,
                middlewareScanner
              );
            },
            this.#autoApply()
          );
        } else {
          // Path B: Direct execution with auto-apply middleware only
          await this.executeFynUnit(fynUnit, fynApp);
        }
      }

      console.debug("✅ FynApp bootstrapped", fynApp.name, fynApp.version);

      // Mount tracking: bootstrap succeeded — app is now mounted/running.
      this.fynAppLifecycle.set(fynApp.name, fynApp.version, "mounted");

      captureEvent(this.tel, "bootstrap.completed", this.#appData(fynApp));

      // Emit bootstrap complete event
      await this.#emitLifecycle("FYNAPP_BOOTSTRAPPED", fynApp);
    } catch (error) {
      this.tel.capErr("bootstrap.failed", { app: fynApp.name }, error);

      // Per-FynApp error boundary: record the failure as observable state
      // (queryable via getFynAppState) while keeping the app in the registry and
      // letting other FynApps continue below.
      this.fynAppLifecycle.set(fynApp.name, fynApp.version, "failed", error);

      // Error isolation: Log error but don't crash the kernel
      console.error(`❌ Bootstrap failed for ${fynApp.name}:`, error);

      // Deafen the half-initialized app: drop its bus subscriptions and
      // handlers; a later re-bootstrap gets a fresh facade (FYM-140)
      this.#disposeBus(fynApp);

      // Emit failure event so other systems can react
      await this.#emitLifecycle("FYNAPP_BOOTSTRAP_FAILED", fynApp, { error });

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

    captureEvent(this.tel, "shutdown.started", { app: name });

    // Mount tracking: mark the transient shutdown state so shutdown() hooks that
    // query state see it; removeFromRegistry() then stops tracking the app.
    this.fynAppLifecycle.set(fynApp.name, fynApp.version, "shutdown");

    try {
      await this.#callUnitHook(fynApp, "shutdown");

      // Remove from registry (both versioned and unversioned keys)
      this.removeFromRegistry(fynApp, name);

      // Remove all of the app's bus subscriptions
      this.#disposeBus(fynApp);

      // Emit shutdown event
      await this.#emitLifecycle("FYNAPP_SHUTDOWN", fynApp);

      captureEvent(this.tel, "shutdown.completed", this.#appData(fynApp));

      console.debug(`✅ FynApp ${fynApp.name}@${fynApp.version} shutdown complete`);
      return true;
    } catch (error) {
      this.tel.capErr("shutdown.failed", { app: name }, error);

      console.error(`❌ Error during shutdown of ${name}:`, error);
      // Still remove from registry and clean up bus even if shutdown fails
      this.removeFromRegistry(fynApp, name);
      this.#disposeBus(fynApp);
      return false;
    }
  }

  /**
   * Suspend a mounted FynApp (only mounted -> suspended is valid).
   */
  async suspendFynApp(name: string): Promise<boolean> {
    return this.#transitionLifecycle(name, {
      from: "mounted",
      to: "suspended",
      hook: "suspend",
      event: "FYNAPP_SUSPENDED",
    });
  }

  /**
   * Resume a suspended FynApp (only suspended -> mounted is valid).
   */
  async resumeFynApp(name: string): Promise<boolean> {
    return this.#transitionLifecycle(name, {
      from: "suspended",
      to: "mounted",
      hook: "resume",
      event: "FYNAPP_RESUMED",
    });
  }

  /**
   * Shared suspend/resume machinery: guard the current lifecycle status, call
   * the given FynUnit hook on each expose that implements it, update state, and
   * emit the lifecycle event. Returns false (no-op) on invalid transitions.
   */
  async #transitionLifecycle(
    name: string,
    opts: { from: FynAppStatus; to: FynAppStatus; hook: "suspend" | "resume"; event: string },
  ): Promise<boolean> {
    const fynApp = this.fynAppRegistry.get(name);
    if (!fynApp) {
      console.debug(`⚠️ ${opts.hook}FynApp: FynApp "${name}" not found`);
      return false;
    }

    const state = this.fynAppLifecycle.get(fynApp.name, fynApp.version);
    if (state?.status !== opts.from) {
      console.debug(
        `⚠️ ${opts.hook}FynApp: "${name}" is ${state?.status ?? "untracked"}, expected ${opts.from}`,
      );
      return false;
    }

    captureEvent(this.tel, `${opts.hook}.started`, this.#appData(fynApp));

    try {
      await this.#callUnitHook(fynApp, opts.hook);

      this.fynAppLifecycle.set(fynApp.name, fynApp.version, opts.to);

      await this.#emitLifecycle(opts.event, fynApp);

      captureEvent(this.tel, `${opts.hook}.completed`, this.#appData(fynApp));
      return true;
    } catch (error) {
      this.tel.capErr(`${opts.hook}.failed`, { app: name }, error);
      console.error(`❌ Error during ${opts.hook} of ${name}:`, error);
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
    this.fynAppLifecycle.remove(fynApp.name, fynApp.version);
  }

  /**
   * Get the current lifecycle state of a FynApp (mount tracking).
   */
  getFynAppState(name: string): FynAppState | undefined {
    return this.fynAppLifecycle.find(name);
  }

  /**
   * List the lifecycle state of every tracked FynApp.
   */
  listFynAppStates(): FynAppState[] {
    return this.fynAppLifecycle.list();
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
