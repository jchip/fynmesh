import { FynEventTarget } from "./event-target";
import { fynMeshShareScope } from "./share-scope";
import {
  FynMeshKernel,
  FynAppMiddleware,
  FynMeshRuntimeData,
  FynApp,
  FynAppEntry,
  FynModule,
  FynAppMiddlewareReg,
  FynAppMiddlewareCallContext,
  FynModuleRuntime,
  FynAppManifest,
  RegistryResolver,
  RegistryResolverResult,
} from "./types";
import { urlJoin } from "./util";

const DummyMiddlewareReg: FynAppMiddlewareReg = {
  regKey: "",
} as FynAppMiddlewareReg;

/**
 * Abstract base class for FynMesh kernel implementations
 * Contains all platform-agnostic logic
 */
export abstract class FynMeshKernelCore implements FynMeshKernel {
  public readonly events: FynEventTarget;
  public readonly version: string = "1.0.0";
  public readonly shareScopeName: string = fynMeshShareScope;

  protected deferInvoke: { callContexts: FynAppMiddlewareCallContext[] }[] = [];

  protected runTime: FynMeshRuntimeData;

  protected middlewareReady: Map<string, any> = new Map();

  // Manifest/registry resolution (browser-first)
  private registryResolver?: RegistryResolver;
  private manifestCache: Map<string, FynAppManifest> = new Map();
  private nodeMeta: Map<string, { name: string; version: string; manifestUrl: string; distBase: string } > = new Map();

  // Bootstrap coordination state
  protected bootstrappingApp: string | null = null;
  protected deferredBootstraps: Array<{ fynApp: FynApp; resolve: () => void }> = [];

  // Track FynApp bootstrap status and provider/consumer relationships
  protected fynAppBootstrapStatus: Map<string, "bootstrapped"> = new Map();
  protected fynAppProviderModes: Map<string, Map<string, "provider" | "consumer">> = new Map();

  // Cache to track which modules have been scanned for middleware exports
  private scannedModules: Set<string> = new Set();

  constructor() {
    this.events = new FynEventTarget();
    this.runTime = {
      appsLoaded: {},
      middlewares: {},
    };

    this.events.on("MIDDLEWARE_READY", (event: Event) => {
      this.handleMiddlewareReady(event as CustomEvent);
    });

    this.events.on("FYNAPP_BOOTSTRAPPED", (event: Event) => {
      this.handleFynAppBootstrapped(event as CustomEvent);
    });
  }

  /**
   * Send an event to the kernel
   * @param event - event to send
   */
  async emitAsync(event: CustomEvent): Promise<boolean> {
    return this.events.dispatchEvent(event);
  }

  /**
   * Install a registry resolver (browser: demo server paths)
   */
  setRegistryResolver(resolver: RegistryResolver): void {
    this.registryResolver = resolver;
  }

  private async fetchJson(url: string): Promise<any> {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  private async resolveAndFetch(name: string, range?: string): Promise<{ key: string; res: RegistryResolverResult; manifest: FynAppManifest }>{
    if (!this.registryResolver) throw new Error("No registry resolver configured");
    const res = await this.registryResolver(name, range);
    const tempKey = `${res.name}@${res.version}`;
    if (this.manifestCache.has(tempKey)) {
      const manifest = this.manifestCache.get(tempKey)!;
      // Store meta for base URL derivation
      const distBase = res.distBase || (new URL(res.manifestUrl, location.href)).pathname.replace(/\/[^/]*$/, "/");
      const version = manifest.version || res.version;
      const key = `${res.name}@${version}`;
      this.nodeMeta.set(key, { name: res.name, version, manifestUrl: res.manifestUrl, distBase });
      return { key, res, manifest };
    }
    let manifest: FynAppManifest;

    // Try to extract embedded manifest from entry file first (zero HTTP overhead)
    // Use Federation.import() to load the SystemJS module and extract the manifest export
    try {
      const Federation = (globalThis as any).Federation;
      if (Federation) {
        const entryUrl = res.manifestUrl.replace(/fynapp\.manifest\.json$/, "fynapp-entry.js");
        const entryModule = await Federation.import(entryUrl);
        if (entryModule && entryModule.__FYNAPP_MANIFEST__) {
          manifest = entryModule.__FYNAPP_MANIFEST__;
          const distBase = res.distBase || (new URL(res.manifestUrl, location.href)).pathname.replace(/\/[^/]*$/, "/");
          // Use version from manifest if available, fallback to resolver version
          const version = manifest.version || res.version;
          const key = `${res.name}@${version}`;
          this.manifestCache.set(key, manifest);
          this.nodeMeta.set(key, { name: res.name, version, manifestUrl: res.manifestUrl, distBase });
          return { key, res, manifest };
        }
      }
    } catch (embeddedErr) {
      // Entry module doesn't exist or doesn't have embedded manifest, fall back to fetching
    }

    try {
      manifest = await this.fetchJson(res.manifestUrl);
    } catch (err1) {
      try {
        // fallback to federation.json in same dist
        const fallback = res.manifestUrl.replace(/fynapp\.manifest\.json$/, "federation.json");
        manifest = await this.fetchJson(fallback);
      } catch (err2) {
        // demo fallback: synthesize an empty manifest (no requires) and proceed
        manifest = { name, version: res.version, requires: [] };
      }
    }
    const distBase = res.distBase || (new URL(res.manifestUrl, location.href)).pathname.replace(/\/[^/]*$/, "/");
    // Use version from manifest if available, fallback to resolver version
    const version = manifest.version || res.version;
    const key = `${res.name}@${version}`;
    this.manifestCache.set(key, manifest);
    this.nodeMeta.set(key, { name: res.name, version, manifestUrl: res.manifestUrl, distBase });
    return { key, res, manifest };
  }

  /**
   * Programmatic API for middlewares to signal readiness.
   * This mirrors MIDDLEWARE_READY event handling but avoids requiring a DOM CustomEvent.
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

  private async handleMiddlewareReady(event: CustomEvent): Promise<void> {
    const { name, status, cc, share } = event.detail;

    const _share = share || {};

    this.middlewareReady.set(cc.reg.fullKey, _share);

    const resumes = [];
    for (let i = 0; i < this.deferInvoke.length; i++) {
      const { callContexts } = this.deferInvoke[i];

      let count = 0;
      for (const deferCC of callContexts) {
        if (deferCC.reg.fullKey === cc.reg.fullKey) {
          deferCC.runtime.share = _share;
          deferCC.status = "ready";
        }
        if (deferCC.status === "ready") {
          count++;
        }
      }

      if (count === callContexts.length) {
        resumes.push(this.deferInvoke[i]);
        this.deferInvoke[i] = null as any;
      }
    }

    if (resumes.length > 0) {
      this.deferInvoke = this.deferInvoke.filter(Boolean);
      for (const resume of resumes) {
        await this.callMiddlewares(resume.callContexts);
      }
    }

    console.debug(
      `✅ Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`,
    );
  }

  /**
   * Handle FynApp bootstrap completion event
   * Resume any deferred bootstraps that have their dependencies satisfied
   */
  private async handleFynAppBootstrapped(event: CustomEvent): Promise<void> {
    const { name } = event.detail;

    console.debug(`✅ FynApp ${name} bootstrap complete, checking deferred bootstraps`);

    // Mark this FynApp as bootstrapped
    this.fynAppBootstrapStatus.set(name, "bootstrapped");

    // Clear the currently bootstrapping app
    this.bootstrappingApp = null;

    // Find the FIRST deferred bootstrap whose dependencies are now satisfied
    let nextIndex = -1;
    for (let i = 0; i < this.deferredBootstraps.length; i++) {
      const deferred = this.deferredBootstraps[i];
      if (this.areBootstrapDependenciesSatisfied(deferred.fynApp)) {
        nextIndex = i;
        break;
      }
    }

    // Resume the ready FynApp and remove from queue
    if (nextIndex >= 0) {
      const next = this.deferredBootstraps.splice(nextIndex, 1)[0];
      console.debug(`🔄 Resuming deferred bootstrap for ${next.fynApp.name} (dependencies satisfied)`);
      next.resolve();
    } else if (this.deferredBootstraps.length > 0) {
      console.debug(
        `⏸️ ${this.deferredBootstraps.length} deferred bootstrap(s) still waiting for dependencies`
      );
    }
  }

  /**
   * Build dependency graph by resolving manifests recursively (browser-only resolver)
   */
  private async buildGraph(requests: Array<{ name: string; range?: string }>): Promise<{
    nodes: Set<string>;
    adj: Map<string, Set<string>>;
    indegree: Map<string, number>;
  }> {
    const adj = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    const nodes = new Set<string>();

    const visit = async (name: string, range?: string, parentKey?: string) => {
      const { key, manifest } = await this.resolveAndFetch(name, range);
      const isNewNode = !nodes.has(key);

      if (isNewNode) {
        nodes.add(key);
        indegree.set(key, indegree.get(key) ?? 0);
      }

      if (parentKey) {
        // Edge: dep (key) -> parent (parentKey)
        const set = adj.get(key) || new Set<string>();
        if (!set.has(parentKey)) {
          set.add(parentKey);
          adj.set(key, set);
          indegree.set(parentKey, (indegree.get(parentKey) ?? 0) + 1);
        }
      }

      // Only process dependencies if this is the first time visiting this node
      if (!isNewNode) {
        return key;
      }

      // Process explicit requires field
      const requires = manifest.requires || [];
      for (const req of requires) {
        await visit(req.name, req.range, key);
      }

      // Process import-exposed dependencies (middleware providers, component libraries, etc.)
      const importExposed = manifest["import-exposed"];
      if (importExposed && typeof importExposed === "object") {
        for (const [packageName, modules] of Object.entries(importExposed)) {
          // Extract requireVersion from any module in this package
          let requireVersion: string | undefined;
          if (modules && typeof modules === "object") {
            // Find the first module with a requireVersion
            for (const moduleInfo of Object.values(modules)) {
              if (moduleInfo && typeof moduleInfo === "object" && "requireVersion" in moduleInfo) {
                requireVersion = moduleInfo.requireVersion as string;
                break;
              }
            }
          }
          // Visit this package as a dependency
          await visit(packageName, requireVersion, key);
        }
      }

      // Process shared-providers dependencies (shared module providers like React)
      const sharedProviders = manifest["shared-providers"];
      if (sharedProviders && typeof sharedProviders === "object") {
        for (const [packageName, providerInfo] of Object.entries(sharedProviders)) {
          // Extract requireVersion from the provider info
          let requireVersion: string | undefined;
          if (providerInfo && typeof providerInfo === "object" && "requireVersion" in providerInfo) {
            requireVersion = providerInfo.requireVersion as string;
          }
          // Visit this package as a dependency
          await visit(packageName, requireVersion, key);
        }
      }

      return key;
    };

    for (const r of requests) {
      await visit(r.name, r.range);
    }

    console.debug('buildGraph completed, nodes:', Array.from(nodes));
    return { nodes, adj, indegree };
  }

  private topoBatches(graph: { nodes: Set<string>; adj: Map<string, Set<string>>; indegree: Map<string, number> }): string[][] {
    const { nodes, adj } = graph;
    const indegree = new Map(graph.indegree);
    const q: string[] = [];
    for (const n of nodes) {
      if ((indegree.get(n) ?? 0) === 0) q.push(n);
    }
    const order: string[] = [];
    const batches: string[][] = [];

    while (q.length) {
      // process a batch (all current zero indegree)
      const batch = q.splice(0, q.length);
      batches.push(batch);
      for (const u of batch) {
        order.push(u);
        for (const v of adj.get(u) ?? []) {
          indegree.set(v, (indegree.get(v) ?? 0) - 1);
          if ((indegree.get(v) ?? 0) === 0) q.push(v);
        }
      }
    }

    if (order.length < nodes.size) {
      const cyclic = [...nodes].filter((k) => (indegree.get(k) ?? 0) > 0);
      throw new Error(`Dependency cycle detected among: ${cyclic.join(", ")}`);
    }

    return batches;
  }

  async loadFynAppsByName(
    requests: Array<{ name: string; range?: string }>,
    options?: { concurrency?: number }
  ): Promise<void> {
    const graph = await this.buildGraph(requests);
    const batches = this.topoBatches(graph);
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 8));

    for (const batch of batches) {
      // Derive baseUrl from nodeMeta (resolver provided distBase or manifest dir)
      const tasks = batch.map((key) => {
        const meta = this.nodeMeta.get(key)!;
        const baseUrl = meta.distBase || meta.manifestUrl.replace(/\/[^/]*$/, "/");
        return async () => {
          console.debug(`📦 Loading ${meta.name}@${meta.version} from ${baseUrl}`);
          await this.loadFynApp(baseUrl);
        };
      });

      // simple concurrency limiting
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
   * Check if a FynApp's bootstrap dependencies are satisfied
   */
  private areBootstrapDependenciesSatisfied(fynApp: FynApp): boolean {
    // Get this FynApp's provider/consumer modes for each middleware
    const modes = this.fynAppProviderModes.get(fynApp.name);
    if (!modes) {
      // No provider/consumer info, dependencies are satisfied
      return true;
    }

    // Check each middleware this FynApp uses
    for (const [middlewareName, mode] of modes.entries()) {
      if (mode === "consumer") {
        // This FynApp is a consumer - find the provider
        const providerName = this.findProviderForMiddleware(middlewareName, fynApp.name);

        if (providerName && !this.fynAppBootstrapStatus.has(providerName)) {
          // Provider exists but hasn't bootstrapped yet
          console.debug(
            `⏳ ${fynApp.name} waiting for provider ${providerName} to bootstrap (middleware: ${middlewareName})`
          );
          return false;
        }
      }
    }

    // All dependencies satisfied
    return true;
  }

  /**
   * Find which FynApp is the provider for a given middleware
   */
  private findProviderForMiddleware(middlewareName: string, excludeFynApp: string): string | null {
    for (const [fynAppName, modes] of this.fynAppProviderModes.entries()) {
      if (fynAppName === excludeFynApp) continue;

      const mode = modes.get(middlewareName);
      if (mode === "provider") {
        return fynAppName;
      }
    }
    return null;
  }

  /**
   * Register a middleware implementation with enhanced error handling
   */
  registerMiddleware(mwReg: FynAppMiddlewareReg): void {
    const { regKey, hostFynApp } = mwReg;

    const versionMap = this.runTime.middlewares[regKey] || Object.create(null);

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
    this.runTime.middlewares[regKey] = versionMap;

    const autoApplyScope = mwReg.middleware.autoApplyScope || [];

    if (autoApplyScope.length > 0) {
      if (!this.runTime.autoApplyMiddlewares) {
        this.runTime.autoApplyMiddlewares = { fynapp: [], middleware: [] };
      }

      if (autoApplyScope.includes("all") || autoApplyScope.includes("fynapp")) {
        this.runTime.autoApplyMiddlewares.fynapp.push(mwReg);
      }

      if (autoApplyScope.includes("all") || autoApplyScope.includes("middleware")) {
        this.runTime.autoApplyMiddlewares.middleware.push(mwReg);
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
      const versionMap = this.runTime.middlewares[middlewareKey];
      if (versionMap) {
        const mwReg = versionMap["default"];
        if (mwReg) {
          return mwReg;
        }
      }
    }
    // Fallback: scan all providers for first available default match
    for (const [key, versionMap] of Object.entries(this.runTime.middlewares)) {
      if (key.endsWith(`::${name}`)) {
        const mwReg = (versionMap as any)["default"];
        if (mwReg) return mwReg;
      }
    }
    return DummyMiddlewareReg;
  }

  /**
   * Initialize the kernel runtime data
   */
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData {
    this.runTime = {
      ...data,
    };
    return this.runTime;
  }

  /**
   * Clean up a container name to ensure it's a valid identifier
   */
  cleanContainerName(name: string): string {
    return name.replace(/[\@\-./]/g, "_").replace(/^_*/, "");
  }

  private async loadExposeModule(
    fynApp: FynApp,
    exposeName: string,
    loadMiddlewares?: boolean,
  ): Promise<any> {
    const container = fynApp.entry.container;
    if (!container?.$E[exposeName]) {
      console.debug(`❌ No expose module '${exposeName}' found for`, fynApp.name, fynApp.version);
      return;
    }
    if (container?.$E[exposeName]) {
      const factory = await fynApp.entry.get(exposeName);
      const exposedModule = typeof factory === "function" ? factory() : undefined;

      const mwExports = [];

      // Create cache key to track if we've already scanned this module for middleware
      const scanCacheKey = `${fynApp.name}@${fynApp.version}::${exposeName}`;

      if (loadMiddlewares && exposedModule && typeof exposedModule === "object") {
        // Check if we've already scanned this module
        if (!this.scannedModules.has(scanCacheKey)) {
          // Mark as scanned before processing to prevent duplicate scans
          this.scannedModules.add(scanCacheKey);

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
        } else {
          console.debug(
            `⏭️  Skipping middleware scan for '${exposeName}' - already scanned for`,
            fynApp.name,
            fynApp.version,
          );
        }

        fynApp.exposes[exposeName] = exposedModule;
        if ((exposedModule as any).__name) {
          fynApp.exposes[(exposedModule as any).__name] = exposedModule;
        }

        return exposedModule;
      }
      return;
    }
  }

  /**
   * Load middleware from a dependency package
   * @param packageName The package name (e.g., "fynapp-react-middleware")
   * @param middlewarePath The middleware path (e.g., "middleware/design-tokens/design-tokens" or "main/react-context")
   */
  private async loadMiddlewareFromDependency(packageName: string, middlewarePath: string): Promise<void> {
    console.debug(`📦 Loading middleware from dependency: ${packageName}/${middlewarePath}`);

    // Find the dependency fynapp
    const dependencyApp = this.runTime.appsLoaded[packageName];

    if (!dependencyApp) {
      console.debug(`❌ Dependency package ${packageName} not found in runtime`);
      return;
    }

    // Extract the expose module from the middleware path
    // The path format is: exposeModule/middlewareName
    // Example: "middleware/design-tokens/design-tokens" -> exposeModule = "middleware/design-tokens"
    const lastSlashIndex = middlewarePath.lastIndexOf('/');
    const exposeModule = lastSlashIndex > 0 ? middlewarePath.substring(0, lastSlashIndex) : middlewarePath;
    const exposeName = `./${exposeModule}`;

    console.debug(`📦 Loading middleware module ${exposeName} from ${packageName} (full path: ${middlewarePath})`);
    await this.loadExposeModule(dependencyApp, exposeName, true);
  }

  async loadFynAppBasics(fynAppEntry: FynAppEntry): Promise<FynApp> {
    const container = fynAppEntry.container;

    console.debug("🚀 Initializing FynApp entry", container.name, container.version);

    // Step 1: Initialize the entry
    fynAppEntry.init();

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
    await this.loadExposeModule(fynApp, "./main", true);

    // Step 6: Proactively load middleware from dependencies
    // Get the embedded manifest from the container
    // The manifest is exported directly on the container, not as an expose module
    const manifest = (container as any).__FYNAPP_MANIFEST__ || null;

    const importExposed = manifest?.["import-exposed"];
    if (importExposed && typeof importExposed === "object") {
      console.debug("📦 Loading middleware dependencies for", fynApp.name);

      for (const [packageName, modules] of Object.entries(importExposed)) {
        if (modules && typeof modules === "object") {
          for (const [modulePath, moduleInfo] of Object.entries(modules)) {
            // Only load middleware type dependencies
            if (moduleInfo && typeof moduleInfo === "object" && moduleInfo.type === "middleware") {
              // The modulePath key is already the correct exposed module path (e.g., "middleware/design-tokens")
              // which corresponds to the "./middleware/design-tokens" expose
              console.debug(`📦 Proactively loading middleware: ${packageName}/${modulePath}`);
              await this.loadMiddlewareFromDependency(packageName, modulePath);
            }
          }
        }
      }
    }

    console.debug("✅ FynApp basics loaded for", fynApp.name, fynApp.version);

    // Record app in runtime registry for observability
    this.runTime.appsLoaded[fynApp.name] = fynApp;

    return fynApp;
  }

  private createFynModuleRuntime(fynApp: FynApp): FynModuleRuntime {
    return {
      fynApp,
      middlewareContext: new Map<string, Record<string, any>>(),
    };
  }

  private async invokeFynModule(fynMod: FynModule, fynApp: FynApp): Promise<void> {
    const runtime = this.createFynModuleRuntime(fynApp);

    // NEW: Check for middleware execution overrides
    const executionOverride = this.findExecutionOverride(fynApp, fynMod);
    
    if (executionOverride) {
      console.debug(`🎭 Middleware ${executionOverride.middleware.name} is overriding execution for ${fynApp.name}`);
      
      const context: FynAppMiddlewareCallContext = {
        meta: { 
          info: { 
            name: executionOverride.middleware.name, 
            provider: executionOverride.hostFynApp.name, 
            version: executionOverride.hostFynApp.version 
          }, 
          config: {} 
        },
        fynMod,
        fynApp,
        reg: executionOverride,
        runtime,
        kernel: this,
        status: "ready",
      };

      // Let middleware handle initialize
      if (executionOverride.middleware.overrideInitialize && fynMod.initialize) {
        console.debug(`🎭 Middleware overriding initialize for ${fynApp.name}`);
        const initResult = await executionOverride.middleware.overrideInitialize(context);
        console.debug(`🎭 Initialize result:`, initResult);
      }

      // Let middleware handle execute
      if (executionOverride.middleware.overrideExecute && typeof fynMod.execute === 'function') {
        console.debug(`🎭 Middleware overriding execute for ${fynApp.name}`);
        await executionOverride.middleware.overrideExecute(context);
      }
      
      return;
    }

    // Original execution flow for non-overridden modules
    if (fynMod.initialize) {
      console.debug("🚀 Invoking module.initialize for", fynApp.name, fynApp.version);
      const initResult = await fynMod.initialize(runtime);
      console.debug("🚀 Initialize result:", initResult);
    }

    if (fynMod.execute) {
      console.debug("🚀 Invoking module.execute for", fynApp.name, fynApp.version);
      const executeResult = await fynMod.execute(runtime);
      
      // Handle typed execution result
      if (executeResult) {
        console.debug(`📦 FynModule returned typed result:`, executeResult.type, executeResult.metadata);
      }
    }
  }

  private findExecutionOverride(fynApp: FynApp, fynModule: FynModule): FynAppMiddlewareReg | null {
    const autoApplyMiddlewares = this.runTime.autoApplyMiddlewares;
    if (!autoApplyMiddlewares) return null;

    // Check middleware that auto-applies to this FynApp type
    const isMiddlewareProvider = Object.keys(fynApp.exposes).some(key => 
      key.startsWith('./middleware')
    );
    
    const targetMiddlewares = isMiddlewareProvider
      ? autoApplyMiddlewares.middleware
      : autoApplyMiddlewares.fynapp;

    // Find first middleware that can override execution
    for (const mwReg of targetMiddlewares) {
      if (mwReg.middleware.canOverrideExecution?.(fynApp, fynModule)) {
        return mwReg;
      }
    }

    return null;
  }

  private checkSingleMiddlewareReady(cc: FynAppMiddlewareCallContext): boolean {
    if (this.middlewareReady.has(cc.reg.fullKey)) {
      cc.runtime.share = this.middlewareReady.get(cc.reg.fullKey);
      cc.status = "ready";
      return true;
    }
    return false;
  }

  private checkMiddlewareReady(ccs: FynAppMiddlewareCallContext[]): string {
    let status = "ready";
    for (const cc of ccs) {
      if (!this.checkSingleMiddlewareReady(cc)) {
        status = "defer";
      }
    }
    return status;
  }

  private checkDeferCalls(status: string, ccs: FynAppMiddlewareCallContext[]): string {
    if (status === "defer") {
      if (this.checkMiddlewareReady(ccs) === "ready") {
        return "retry";
      }
      // Dedupe: avoid pushing identical pending groups
      const incomingKeys = ccs.map((c) => c.reg.fullKey).sort().join("|");
      const exists = this.deferInvoke.some((d) => {
        const keys = d.callContexts.map((c) => c.reg.fullKey).sort().join("|");
        return keys === incomingKeys;
      });
      if (!exists) {
        this.deferInvoke.push({
          callContexts: ccs,
        });
      }
      return "defer";
    }
    return "ready";
  }

  private async callMiddlewares(ccs: FynAppMiddlewareCallContext[], tries = 0): Promise<string> {
    // Handle empty middleware array - nothing to call
    if (ccs.length === 0) {
      console.debug("⚠️ No middleware contexts to call, skipping middleware setup");
      return "ready";
    }

    if (tries > 1) {
      console.error("🚨 Middleware setup failed after 2 tries", ccs);
      throw new Error("Middleware setup failed after 2 tries");
    }

    this.checkMiddlewareReady(ccs);
    let status = "ready";

    for (const cc of ccs) {
      const { fynApp, reg } = cc;
      const mw = reg.middleware;
      this.checkSingleMiddlewareReady(cc);
      if (mw.setup) {
        console.debug(
          "🚀 Invoking middleware",
          reg.regKey,
          "setup for",
          fynApp.name,
          fynApp.version,
        );
        const result = await mw.setup(cc);
        // Auto-signal if middleware reports ready and didn't already signal via event
        if (result?.status === "ready" && !this.middlewareReady.has(cc.reg.fullKey)) {
          await this.signalMiddlewareReady(cc, { share: result?.share });
        }
        if (result?.status === "defer") {
          status = "defer";
        }
      }
    }

    status = this.checkDeferCalls(status, ccs);
    if (status === "defer") {
      return status;
    }
    if (status === "retry") {
      return await this.callMiddlewares(ccs, tries + 1);
    }

    const fynMod = ccs[0].fynMod;
    const fynApp = ccs[0].fynApp;
    const runtime = ccs[0].runtime;

    if (fynMod.initialize) {
      console.debug("🚀 Invoking user.initialize for", fynApp.name, fynApp.version);
      const result: any = await fynMod.initialize(runtime);

      // Capture provider/consumer mode for dependency tracking
      if (result?.mode) {
        // Track this FynApp's mode for each middleware it uses
        if (!this.fynAppProviderModes.has(fynApp.name)) {
          this.fynAppProviderModes.set(fynApp.name, new Map());
        }
        const modes = this.fynAppProviderModes.get(fynApp.name)!;

        // Store mode for each middleware this FynApp uses
        for (const cc of ccs) {
          modes.set(cc.reg.middleware.name, result.mode);
        }

        console.debug(`📝 ${fynApp.name} registered as ${result.mode} for middleware(s)`);
      }

      status = this.checkDeferCalls(result?.status, ccs);
      if (status === "defer") {
        // User initialize requested defer and middleware not all ready: respect defer
        return "defer";
      }

      if (status === "retry") {
        if (result?.status === "defer") {
          return await this.callMiddlewares(ccs, tries + 1);
        }
        return await this.callMiddlewares(ccs, tries + 1);
      }
    }

    for (const cc of ccs) {
      const { reg } = cc;
      const mw = reg.middleware;
      if (mw.apply) {
        console.debug(
          "🚀 Invoking middleware",
          reg.regKey,
          "apply for",
          fynApp.name,
          fynApp.version,
        );
        await mw.apply(cc);
      }
    }

    if (fynMod.execute) {
      console.debug("🚀 Invoking user.execute for", fynApp.name, fynApp.version);
      await fynMod.execute(runtime);
    }

    return "ready";
  }

  private async useMiddlewareOnFynModule(
    fynMod: FynModule,
    fynApp: FynApp,
  ): Promise<string> {
    if (!fynMod.__middlewareMeta) {
      return "";
    }

    const runtime = this.createFynModuleRuntime(fynApp);

    console.debug("🔍 Processing middleware metadata:", fynMod.__middlewareMeta);

    const ccs: FynAppMiddlewareCallContext[] = [];

    for (const meta of fynMod.__middlewareMeta) {
      console.debug("🔍 Processing meta item:", meta);

      let cc: FynAppMiddlewareCallContext | null = null;

      // Handle new string format: "-FYNAPP_MIDDLEWARE package-name middleware-path [semver]"
      // Note: semver is optional
      if (typeof meta === 'string') {
        const parts = (meta as string).trim().split(' ');
        if (parts.length >= 3 && parts[0] === '-FYNAPP_MIDDLEWARE') {
          const [, packageName, middlewarePath, semver] = parts;
          const middlewareName = middlewarePath.split('/').pop() || middlewarePath;
          console.debug("🔍 String format - package:", packageName, "middleware:", middlewarePath, "semver:", semver || "any");

          // Try to load middleware from dependency package first
          await this.loadMiddlewareFromDependency(packageName, middlewarePath);

          const reg = this.getMiddleware(middlewareName, packageName);
          if (reg.regKey === "") {
            console.debug("❌ No middleware found for", middlewareName, packageName);
            continue;
          }
          cc = {
            meta: {
              info: {
                name: middlewareName,
                provider: packageName,
                version: semver || "*"
              },
              config: {}
            },
            fynMod,
            fynApp,
            reg,
            kernel: this,
            runtime,
            status: "",
          };
        }
      } else if (meta && typeof meta === 'object') {
        console.debug("🔍 Object format meta:", meta);

        // Check for new format with middleware property containing the string
        if ((meta as any).middleware && typeof (meta as any).middleware === 'string') {
          const middlewareStr = (meta as any).middleware as string;
          const parts = middlewareStr.trim().split(' ');

          if (parts.length >= 3 && parts[0] === '-FYNAPP_MIDDLEWARE') {
            const [, packageName, middlewarePath, semver] = parts;
            const middlewareName = middlewarePath.split('/').pop() || middlewarePath;
            console.debug("🔍 Object wrapper format - package:", packageName, "middleware:", middlewarePath, "semver:", semver || "any");

            // Try to load middleware from dependency package first
            await this.loadMiddlewareFromDependency(packageName, middlewarePath);

            const reg = this.getMiddleware(middlewareName, packageName);
            if (reg.regKey === "") {
              console.debug("❌ No middleware found for", middlewareName, packageName);
              continue;
            }
            cc = {
              meta: {
                info: {
                  name: middlewareName,
                  provider: packageName,
                  version: semver || "*"
                },
                config: (meta as any).config || {}
              },
              fynMod,
              fynApp,
              reg,
              kernel: this,
              runtime,
              status: "",
            };
          }
        } else if ((meta as any).info) {
          // Handle legacy object format with info property
          const info = (meta as any).info;
          console.debug("🔍 Legacy format - name:", info.name, "provider:", info.provider);

          const reg = this.getMiddleware(info.name, info.provider);
          if (reg.regKey === "") {
            console.debug("❌ No middleware found for", info.name, info.provider);
            continue;
          }
          cc = {
            meta,
            fynMod,
            fynApp,
            reg,
            kernel: this,
            runtime,
            status: "",
          };
        } else {
          console.debug("❌ Object format missing both middleware and info properties:", meta);
        }
      }

      if (cc) {
        ccs.push(cc);
      } else {
        console.debug("❌ Unrecognized middleware meta format:", meta);
      }
    }

    console.debug("✅ Created", ccs.length, "middleware call contexts");

    return this.callMiddlewares(ccs);
  }

  private async applyAutoScopeMiddlewares(fynApp: FynApp, fynModule?: FynModule): Promise<void> {
    console.log(`🎯 Auto-apply check for ${fynApp.name}: autoApplyMiddlewares exists?`, !!this.runTime.autoApplyMiddlewares);
    const autoApplyMiddlewares = this.runTime.autoApplyMiddlewares;
    if (!autoApplyMiddlewares) {
      console.log(`⏭️ No auto-apply middlewares registered yet for ${fynApp.name}`);
      return;
    }

    // Determine if this is a middleware provider FynApp
    const isMiddlewareProvider = Object.keys(fynApp.exposes).some(key =>
      key.startsWith('./middleware')
    );

    // Apply middleware based on FynApp type
    const targetMiddlewares = isMiddlewareProvider
      ? autoApplyMiddlewares.middleware
      : autoApplyMiddlewares.fynapp;

    for (const mwReg of targetMiddlewares) {
      // Check if middleware has a filter function and call it
      if (mwReg.middleware.shouldApply) {
        try {
          const shouldApply = mwReg.middleware.shouldApply(fynApp);
          if (!shouldApply) {
            console.debug(`⏭️ Skipping middleware ${mwReg.regKey} for ${fynApp.name} (filtered out)`);
            continue;
          }
        } catch (error) {
          console.error(`❌ Error in shouldApply for ${mwReg.regKey}:`, error);
          continue;
        }
      }

      console.debug(
        `🔄 Auto-applying ${mwReg.middleware.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`
      );

      const context: FynAppMiddlewareCallContext = {
        meta: {
          info: {
            name: mwReg.middleware.name,
            provider: mwReg.hostFynApp.name,
            version: mwReg.hostFynApp.version,
          },
          config: {},
        },
        fynMod: fynModule || { async execute() { } },
        fynApp,
        reg: mwReg,
        runtime: this.createFynModuleRuntime(fynApp),
        kernel: this,
        status: "ready",
      };

      try {
        if (mwReg.middleware.setup) {
          const result = await mwReg.middleware.setup(context);
          if (result?.status === "ready") {
            await this.signalMiddlewareReady(context, { share: result.share });
          }
        }
        if (mwReg.middleware.apply) {
          await mwReg.middleware.apply(context);
        }
      } catch (error) {
        console.error(`❌ Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}:`, error);
      }
    }
  }

  /**
   * Bootstrap a fynapp by:
   * - call main as function or invoke it as a FynModule
   * Uses event-based coordination to prevent concurrent bootstrap issues
   */
  async bootstrapFynApp(fynApp: FynApp): Promise<void> {
    // Check if another app is currently bootstrapping OR dependencies not satisfied
    if (this.bootstrappingApp !== null || !this.areBootstrapDependenciesSatisfied(fynApp)) {
      const reason = this.bootstrappingApp !== null
        ? `${this.bootstrappingApp} is currently bootstrapping`
        : `waiting for provider dependencies`;

      console.debug(`⏸️ Deferring bootstrap of ${fynApp.name} (${reason})`);

      // Defer this bootstrap - wait for dependencies to be ready
      await new Promise<void>((resolve) => {
        this.deferredBootstraps.push({ fynApp, resolve });
      });

      // After being resumed, mark as bootstrapping
      console.debug(`▶️ Resuming bootstrap of ${fynApp.name}`);
    }

    // Mark this app as currently bootstrapping
    this.bootstrappingApp = fynApp.name;
    console.debug(`🔒 ${fynApp.name} acquired bootstrap lock`);

    try {
      // Always load middleware modules for all FynApps
      for (const exposeName of Object.keys(fynApp.entry.container.$E)) {
        if (exposeName.startsWith("./middleware")) {
          await this.loadExposeModule(fynApp, exposeName, true);
        }
      }

      const mainFynModule = fynApp.exposes["./main"]?.main;

      if (mainFynModule) {
        console.debug("🚀 Bootstrapping FynApp", fynApp.name, fynApp.version);

        await this.applyAutoScopeMiddlewares(fynApp, mainFynModule);

        if (typeof mainFynModule === "function") {
          await (mainFynModule as any)(this.createFynModuleRuntime(fynApp));
        } else if (mainFynModule.__middlewareMeta) {
          await this.useMiddlewareOnFynModule(mainFynModule, fynApp);
        } else {
          await this.invokeFynModule(mainFynModule as FynModule, fynApp);
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
      // Clear bootstrap lock and resume next
      this.bootstrappingApp = null;
      if (this.deferredBootstraps.length > 0) {
        const next = this.deferredBootstraps.shift();
        if (next) next.resolve();
      }
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
  abstract loadFynApp(baseUrl: string, loadId?: string): Promise<void>;
}
