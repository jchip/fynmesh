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
import { MiddlewareManager } from "./modules/middleware-manager";
import { ModuleLoader } from "./modules/module-loader";
import { MiddlewareExecutor } from "./modules/middleware-executor";

import type {
  FynMeshKernel,
  FynAppMiddleware,
  FynMeshRuntimeData,
  FynApp,
  FynAppEntry,
  FynModule,
  FynAppMiddlewareReg,
  FynAppMiddlewareCallContext,
  FynModuleRuntime,
  RegistryResolver,
} from "./types";

/**
 * Abstract base class for FynMesh kernel implementations
 * Now using modular architecture with extracted components
 */
export abstract class FynMeshKernelCore implements FynMeshKernel {
  public readonly events: FynEventTarget;
  public readonly version: string = "1.0.0";
  public readonly shareScopeName: string = fynMeshShareScope;

  protected runTime: FynMeshRuntimeData;

  // Extracted modules
  public manifestResolver: ManifestResolver;
  public bootstrapCoordinator: BootstrapCoordinator;
  public middlewareManager: MiddlewareManager;
  public moduleLoader: ModuleLoader;
  public middlewareExecutor: MiddlewareExecutor;

  constructor() {
    this.events = new FynEventTarget();
    this.runTime = {
      appsLoaded: {},
      middlewares: {},
    };

    // Initialize extracted modules
    this.manifestResolver = new ManifestResolver();
    this.bootstrapCoordinator = new BootstrapCoordinator(this.events);
    this.middlewareManager = new MiddlewareManager();
    this.moduleLoader = new ModuleLoader();
    this.middlewareExecutor = new MiddlewareExecutor();

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
        async (cc, share) => this.signalMiddlewareReady(cc, { share }),
        (fynAppName, middlewareName, mode) => 
          this.bootstrapCoordinator.registerProviderMode(fynAppName, middlewareName, mode)
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
    // Preload initial FynApp entry files before building dependency graph
    // This allows the initial batch to start loading in parallel
    const preloadCallback = this.manifestResolver["preloadCallback"];
    if (preloadCallback) {
      for (const req of requests) {
        const res = await this.manifestResolver["registryResolver"]!(req.name, req.range);
        const distBase = this.manifestResolver["calculateDistBase"](res);
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
   * Initialize the kernel runtime data
   */
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData {
    this.runTime = { ...data };
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
   * Load FynApp basics
   */
  async loadFynAppBasics(fynAppEntry: FynAppEntry): Promise<FynApp> {
    return this.moduleLoader.loadFynAppBasics(
      fynAppEntry,
      this.runTime.appsLoaded,
      (mwReg) => this.registerMiddleware(mwReg)
    );
  }

  /**
   * Bootstrap a fynapp
   */
  async bootstrapFynApp(fynApp: FynApp): Promise<void> {
    // Check if can bootstrap or need to defer
    if (!this.bootstrapCoordinator.canBootstrap(fynApp)) {
      console.debug(`⏸️ Deferring bootstrap of ${fynApp.name}`);
      await this.bootstrapCoordinator.deferBootstrap(fynApp);
      console.debug(`▶️ Resuming bootstrap of ${fynApp.name}`);
    }

    // Acquire bootstrap lock
    this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name);

    try {
      // Always load middleware modules for all FynApps
      for (const exposeName of Object.keys(fynApp.entry.container.$E)) {
        if (exposeName.startsWith("./middleware")) {
          await this.moduleLoader.loadExposeModule(
            fynApp, 
            exposeName, 
            true,
            (mwReg) => this.registerMiddleware(mwReg)
          );
        }
      }

      const mainFynModule = fynApp.exposes["./main"]?.main;

      if (mainFynModule) {
        console.debug("🚀 Bootstrapping FynApp", fynApp.name, fynApp.version);

        // Apply auto-scope middlewares
        await this.middlewareExecutor.applyAutoScopeMiddlewares(
          fynApp,
          mainFynModule as FynModule,
          this,
          this.middlewareManager.getAutoApplyMiddlewares(),
          () => this.moduleLoader.createFynModuleRuntime(fynApp),
          async (cc, share) => this.signalMiddlewareReady(cc, { share })
        );

        if (typeof mainFynModule === "function") {
          await (mainFynModule as any)(this.moduleLoader.createFynModuleRuntime(fynApp));
        } else if ((mainFynModule as FynModule).__middlewareMeta) {
          await this.middlewareExecutor.useMiddlewareOnFynModule(
            mainFynModule as FynModule,
            fynApp,
            this,
            () => this.moduleLoader.createFynModuleRuntime(fynApp),
            (name, provider) => this.getMiddleware(name, provider),
            async (packageName, middlewarePath) => {
              await this.moduleLoader.loadMiddlewareFromDependency(
                packageName,
                middlewarePath,
                this.runTime.appsLoaded,
                (mwReg) => this.registerMiddleware(mwReg)
              );
            }
          );
        } else {
          await this.moduleLoader.invokeFynModule(
            mainFynModule as FynModule,
            fynApp,
            this.middlewareManager.getAutoApplyMiddlewares()
          );
        }
      }

      console.debug("✅ FynApp bootstrapped", fynApp.name, fynApp.version);

      // Emit bootstrap complete event
      await this.emitAsync(
        new CustomEvent("FYNAPP_BOOTSTRAPPED", {
          detail: { name: fynApp.name, version: fynApp.version },
        })
      );
    } catch (error) {
      console.error(`❌ Bootstrap failed for ${fynApp.name}:`, error);
      // Release lock and resume next
      this.bootstrapCoordinator.releaseBootstrapLock();
      throw error;
    }
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
