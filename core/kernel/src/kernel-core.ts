/**
 * FynMesh Kernel Core - Refactored Version
 * Now using extracted modules for better maintainability
 */

import { FynEventTarget } from "./event-target";
import { fynMeshShareScope } from "./share-scope";
import { urlJoin } from "./util";

// Import extracted modules
import { ManifestResolver } from "./modules/manifest-resolver";
import { BootstrapCoordinator } from "./modules/bootstrap-coordinator";
import { ModuleLoader } from "./modules/module-loader";
import { FynAppRegistry } from "./modules/fynapp-registry";
import { FynAppLifecycle } from "./modules/fynapp-lifecycle";

import type {
  FynMeshKernel,
  FynMeshRuntimeData,
  FynApp,
  FynAppEntry,
  FynAppLoadEventDetail,
  FynAppState,
  FynAppStatus,
  FynUnit,
  FynUnitRuntime,
  KernelAddon,
  KernelHooks,
  RegistryResolver,
  KernelTelemetry,
} from "./types";
import { forwardTelemetry, noOpTelemetry, captureEvent } from "./kernel-telemetry";
import { KERNEL_VERSION } from "./kernel-version";

/**
 * Abstract base class for FynMesh kernel implementations.
 *
 * Core only: manifests, the dependency graph, loading, bootstrap ordering and
 * lifecycle. Middleware, FynBus, telemetry and the dev overlay are add-ons that
 * plug in through `use()` and the hooks in `KernelHooks`.
 */
export abstract class FynMeshKernelCore implements FynMeshKernel {
  public readonly events: FynEventTarget;
  public readonly version: string = KERNEL_VERSION;
  public readonly shareScopeName: string = fynMeshShareScope;

  protected runTime: FynMeshRuntimeData;

  // Telemetry: forwards to a sink the telemetry add-on can swap in
  #telSink: KernelTelemetry = noOpTelemetry;
  public tel: KernelTelemetry = forwardTelemetry(() => this.#telSink);

  // Add-ons
  #addons = new Set<string>();
  protected hooks: KernelHooks;

  // Extracted modules
  public manifestResolver: ManifestResolver;
  public bootstrapCoordinator: BootstrapCoordinator;
  public loader: ModuleLoader;
  public fynAppRegistry: FynAppRegistry;
  public fynAppLifecycle: FynAppLifecycle;

  constructor() {
    this.events = new FynEventTarget();
    this.runTime = {
      apps: {},
      middlewares: {},
    };
    this.fynAppRegistry = new FynAppRegistry(this.runTime.apps);
    this.fynAppLifecycle = new FynAppLifecycle();

    this.hooks = {
      tel: this.tel,
      setTel: (sink) => {
        this.#telSink = sink;
      },
      rt: () => this.runTime,
      findApp: (name) => this.fynAppRegistry.get(name),
      loadExpose: (fynApp, exposeName) =>
        this.loader.loadExposeModule(fynApp, exposeName, true, this.#onExpose),
      runtimeFor: (fynApp) => this.#runtimeFor(fynApp),
      providerMode: (fynAppName, name, mode) =>
        this.bootstrapCoordinator.registerProviderMode(fynAppName, name, mode),
      init: [],
      exposeLoaded: [],
      basicsLoaded: [],
      beforeMain: [],
      runUnit: [],
      runtime: [],
      appGone: [],
    };

    // Initialize extracted modules with scoped telemetry
    this.manifestResolver = new ManifestResolver(this.tel.scope("manifest"));
    this.bootstrapCoordinator = new BootstrapCoordinator(this.events, undefined, this.tel.scope("bootstrap"));
    this.loader = new ModuleLoader(this.tel.scope("loader"), this.hooks);
  }

  /**
   * Install an add-on. A name already installed is skipped, so loading the
   * same add-on bundle twice is harmless.
   */
  use(addon: KernelAddon): void {
    if (this.#addons.has(addon.name)) {
      return;
    }
    this.#addons.add(addon.name);
    addon.install(this, this.hooks);
  }

  /** Runs the `exposeLoaded` hooks for each recorded expose module. */
  #onExpose = (fynApp: FynApp, exposeName: string, exposedModule: any): void => {
    for (const h of this.hooks.exposeLoaded) {
      h(fynApp, exposeName, exposedModule);
    }
  };

  /**
   * Send an event to the kernel
   */
  async emitAsync(event: CustomEvent): Promise<boolean> {
    return this.events.dispatchEvent(event);
  }

  /** Fresh FynUnit runtime for a FynApp. */
  #runtimeFor(fynApp: FynApp): FynUnitRuntime {
    return this.loader.mkRuntime(fynApp);
  }

  /** Telemetry payload identifying a FynApp. */
  #appData(fynApp: FynApp) {
    return { app: fynApp.name, version: fynApp.version };
  }

  /** Let add-ons drop what they hold for an app that is gone. */
  #appGone(fynApp: FynApp): void {
    for (const h of this.hooks.appGone) {
      h(fynApp);
    }
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

    // Progress events for the apps this batch will actually load.
    const requestedBy = requests.map((r) => r.name);
    const emitLoad = (type: string, key: string, ok?: boolean) => {
      const { name, version } = allMeta.get(key)!;
      const detail: FynAppLoadEventDetail = { name, version, requestedBy, ...(ok !== undefined && { ok }) };
      this.events.dispatchEvent(new CustomEvent(type, { detail }));
    };
    const toLoad = new Set(batches.flat().filter((key) => !this.fynAppRegistry.has(key)));
    for (const key of toLoad) emitLoad("FYNAPP_LOADING", key);

    for (const batch of batches) {
      // Bounded-concurrency walk over the batch. Workers share one cursor, so
      // each key is claimed once; there is no need to materialise a closure per
      // key first — the worker derives the baseUrl from nodeMeta as it goes.
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
          while (next < batch.length) {
            const key = batch[next++];
            const meta = allMeta.get(key)!;
            const baseUrl = meta.distBase || meta.url.replace(/\/[^/]*$/, "/");
            console.debug(`📦 Loading ${meta.name}@${meta.version} from ${baseUrl}`);
            const fynApp = await this.loadFynApp(baseUrl);
            if (toLoad.has(key)) emitLoad("FYNAPP_LOADED", key, fynApp !== null);
          }
        })
      );
    }

    this.tel.capture({ type: "event", name: "load_batch.completed" });
  }

  /**
   * Initialize the kernel runtime data
   */
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData {
    this.runTime = { ...data };
    this.fynAppRegistry.initialize(this.runTime.apps);
    for (const h of this.hooks.init) {
      h(data);
    }
    return this.runTime;
  }

  /**
   * Load FynApp basics
   */
  async loadFynAppBasics(fynAppEntry: FynAppEntry): Promise<FynApp> {
    return this.loader.loadFynAppBasics(fynAppEntry, this.fynAppRegistry, this.#onExpose);
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
   * Run the main FynUnit. An add-on's `runUnit` hook may take it over (the
   * middleware add-on does); otherwise the kernel initializes and executes it.
   */
  private async runMainUnit(fynApp: FynApp, fynUnit: FynUnit): Promise<void> {
    for (const h of this.hooks.runUnit) {
      if (await h(fynApp, fynUnit)) {
        return;
      }
    }
    if (fynUnit.__middlewareMeta?.length && this.hooks.runUnit.length === 0) {
      console.warn(`⚠️ ${fynApp.name} declares middleware, but the middleware add-on is not installed`);
    }
    await this.loader.invokeFynUnit(fynUnit, fynApp);
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
      for (const h of this.hooks.beforeMain) {
        await h(fynApp);
      }

      const mainExport = fynApp.exposes["./main"]?.main;
      if (mainExport) {
        console.debug("🚀 Bootstrapping FynApp", fynApp.name, fynApp.version);
        await this.runMainUnit(fynApp, this.validateFynUnit(mainExport, fynApp.name));
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

      // Deafen the half-initialized app: add-ons drop what they hold for it
      // (the bus drops its subscriptions); a later re-bootstrap starts fresh
      this.#appGone(fynApp);

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

      // Let add-ons drop what they hold for the app
      this.#appGone(fynApp);

      // Emit shutdown event
      await this.#emitLifecycle("FYNAPP_SHUTDOWN", fynApp);

      captureEvent(this.tel, "shutdown.completed", this.#appData(fynApp));

      console.debug(`✅ FynApp ${fynApp.name}@${fynApp.version} shutdown complete`);
      return true;
    } catch (error) {
      this.tel.capErr("shutdown.failed", { app: name }, error);

      console.error(`❌ Error during shutdown of ${name}:`, error);
      // Still remove from registry and clean up add-ons even if shutdown fails
      this.removeFromRegistry(fynApp, name);
      this.#appGone(fynApp);
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
   * ***Debug snapshot*** -- `kernel.__I()`.
   *
   * Named after `Federation.__I()`, and a hatch for the same reason: the
   * production kernel mangles property names, and `bootstrapCoordinator` is
   * one of the five fields `build/reserved-names.mjs` deliberately leaves
   * manglable, because reaching for kernel-internal wiring from a host page is
   * unsupported. The cost of that was a reader who could not tell a bootstrap
   * queue that is *idle* from one it cannot *read* -- opposite states that
   * both render as an empty panel. This returns the queue, and only the queue:
   * everything else a tool wants off the kernel is already declared in
   * `types.ts` and therefore already survives.
   *
   * Two things keep it readable in the shipped bundle, and both are load-
   * bearing:
   *
   * - `__I` is held back by `EXTERNAL_CONTRACT` in `build/reserved-names.mjs`,
   *   pinned by `tests/debug-snapshot.test.ts`. Deliberately *not* declared on
   *   `FynMeshKernel` in `types.ts`: that would reserve it by derivation, but
   *   it would also make a debugging hatch part of the kernel's public API,
   *   and it would drag every name in the return type into the reserved list
   *   along with it.
   * - every key below is **quoted**. The kernel's terser config mangles
   *   properties by default and `keep_quoted: true` is the documented escape
   *   hatch for names no declaration describes. Unquote one and the shipped
   *   snapshot carries a one-letter key nothing can read.
   *
   * `v` is an envelope version, stamped from the first commit so a consumer
   * keys off the shape rather than guessing at it.
   *
   * Plain data throughout -- strings, arrays and object literals, no live
   * kernel objects and no functions -- so it survives `structuredClone` and
   * can cross a message boundary into a devtools panel. `holder` is `null`,
   * never absent, when nobody holds the lock: that is the kernel's own way of
   * writing "free", and it is a state, not a gap.
   */
  __I(): Record<string, unknown> {
    const bc = this.bootstrapCoordinator;
    return {
      "v": 1,
      "bootstrap": {
        "holder": bc.bootstrappingApp,
        "deferred": bc.deferredBootstraps.map((d) => ({
          "name": d.fynApp.name,
          "version": d.fynApp.version,
        })),
        "bootstrapped": [...bc.fynAppBootstrapStatus.keys()],
        "modes": [...bc.fynAppProviderModes.entries()].map(([app, roles]) => ({
          "app": app,
          "roles": [...roles.entries()].map(([middleware, mode]) => ({
            "middleware": middleware,
            "mode": mode,
          })),
        })),
      },
    };
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
