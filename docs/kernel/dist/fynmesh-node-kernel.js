/**
 * Checks if the given handler is an EventListener function
 * @param handler The handler to check
 * @returns True if the handler is a function, false otherwise
 */
function isEventListener(handler) {
    return typeof handler === "function";
}
/**
 * Extended EventTarget class for the FynMesh kernel
 * Adds convenient methods for event handling
 */
class FynEventTarget extends EventTarget {
    constructor() {
        super();
    }
    /**
     * Add an event listener
     * @param type The event type to listen for
     * @param handler The event handler
     * @param options Optional addEventListener options
     */
    on(type, handler, options) {
        this.addEventListener(type, handler, options);
    }
    /**
     * Add a one-time event listener
     * @param type The event type to listen for
     * @param handler The event handler
     * @param options Optional addEventListener options
     */
    once(type, handler, options) {
        const xh = (evt) => {
            this.removeEventListener(type, xh);
            if (isEventListener(handler)) {
                return handler(evt);
            }
            else {
                return handler.handleEvent(evt);
            }
        };
        this.addEventListener(type, xh, options);
    }
}

/**
 * Default share scope name for the FynMesh kernel
 */
const fynMeshShareScope = "fynmesh";

function urlJoin(baseUrl, urlPath) {
    const fillSlash = urlPath.startsWith("/") || baseUrl.endsWith("/") ? "" : "/";
    return `${baseUrl}${fillSlash}${urlPath}`;
}
/**
 * Check if a FynApp is a middleware provider
 * @param fynApp The FynApp to check
 * @returns true if the FynApp exposes middleware modules
 */
function isFynAppMiddlewareProvider(fynApp) {
    return Object.keys(fynApp.exposes).some(key => key.startsWith('./middleware'));
}

/**
 * Manifest Resolution Module
 * Handles FynApp manifest fetching, caching, and dependency resolution
 */
class ManifestResolver {
    constructor() {
        this.manifestCache = new Map();
        this.nodeMeta = new Map();
        this.preloadedEntries = new Map();
    }
    /**
     * Install a registry resolver (browser: demo server paths)
     */
    setRegistryResolver(resolver) {
        this.registryResolver = resolver;
    }
    /**
     * Set callback for preloading entry files
     */
    setPreloadCallback(callback) {
        this.preloadCallback = callback;
    }
    /**
     * Preload an entry file (with deduplication and depth tracking)
     * @private
     */
    preloadEntryFile(name, distBase, depth) {
        const entryUrl = `${distBase}fynapp-entry.js`;
        // Use Map to track both URL and depth for deduplication
        if (this.preloadedEntries.has(entryUrl)) {
            return; // Already preloaded
        }
        this.preloadedEntries.set(entryUrl, depth);
        if (this.preloadCallback) {
            console.debug(`⚡ Preloading entry file: ${entryUrl} (depth: ${depth})`);
            this.preloadCallback(entryUrl, depth);
        }
    }
    /**
     * Get metadata for a resolved package
     */
    getNodeMeta(key) {
        return this.nodeMeta.get(key);
    }
    /**
     * Get all node metadata
     */
    getAllNodeMeta() {
        return this.nodeMeta;
    }
    /**
     * Clear caches
     */
    clearCache() {
        this.manifestCache.clear();
        this.nodeMeta.clear();
        this.preloadedEntries.clear();
    }
    /**
     * Fetch JSON from URL
     * @private
     */
    async fetchJson(url) {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok)
            throw new Error(`HTTP ${res.status} for ${url}`);
        return res.json();
    }
    /**
     * Calculate distBase from resolver result
     * @private
     */
    calculateDistBase(res) {
        return res.distBase ||
            (new URL(res.manifestUrl, location.href)).pathname.replace(/\/[^/]*$/, "/");
    }
    /**
     * Update node metadata with manifest info
     * @private
     */
    updateNodeMeta(key, res, manifest) {
        const distBase = this.calculateDistBase(res);
        const finalVersion = manifest.version || res.version;
        this.nodeMeta.set(key, {
            name: res.name,
            version: finalVersion,
            manifestUrl: res.manifestUrl,
            distBase
        });
    }
    /**
     * Resolve and fetch a manifest with caching
     */
    async resolveAndFetch(name, range) {
        if (!this.registryResolver) {
            throw new Error("No registry resolver configured");
        }
        const res = await this.registryResolver(name, range);
        // Optimize: Create final key once and check cache
        const resolvedVersion = res.version;
        const cacheKey = `${res.name}@${resolvedVersion}`;
        const cached = this.manifestCache.get(cacheKey);
        if (cached) {
            // Fast path: already cached
            this.updateNodeMeta(cacheKey, { ...res, version: resolvedVersion }, cached);
            return { key: cacheKey, res, manifest: cached };
        }
        let manifest;
        // Try to extract embedded manifest from entry file first (zero HTTP overhead)
        // Use Federation.import() to load the SystemJS module and extract the manifest export
        try {
            const Federation = globalThis.Federation;
            if (Federation) {
                const entryUrl = res.manifestUrl.replace(/fynapp\.manifest\.json$/, "fynapp-entry.js");
                const entryModule = await Federation.import(entryUrl);
                if (entryModule && entryModule.__FYNAPP_MANIFEST__) {
                    manifest = entryModule.__FYNAPP_MANIFEST__;
                    const key = `${res.name}@${manifest.version || res.version}`;
                    this.manifestCache.set(key, manifest);
                    this.updateNodeMeta(key, res, manifest);
                    return { key, res, manifest };
                }
            }
        }
        catch (embeddedErr) {
            // Entry module doesn't exist or doesn't have embedded manifest, fall back to fetching
        }
        try {
            manifest = await this.fetchJson(res.manifestUrl);
        }
        catch (err1) {
            try {
                // fallback to federation.json in same dist
                const fallback = res.manifestUrl.replace(/fynapp\.manifest\.json$/, "federation.json");
                manifest = await this.fetchJson(fallback);
            }
            catch (err2) {
                // demo fallback: synthesize an empty manifest (no requires) and proceed
                manifest = { name, version: res.version, requires: [] };
            }
        }
        const key = `${res.name}@${manifest.version || res.version}`;
        this.manifestCache.set(key, manifest);
        this.updateNodeMeta(key, res, manifest);
        return { key, res, manifest };
    }
    /**
     * Build dependency graph by resolving manifests recursively
     */
    async buildGraph(requests) {
        const adj = new Map();
        const indegree = new Map();
        const nodes = new Set();
        const visit = async (name, range, parentKey, depth = 0) => {
            const { key, manifest } = await this.resolveAndFetch(name, range);
            const isNewNode = !nodes.has(key);
            if (isNewNode) {
                nodes.add(key);
                indegree.set(key, indegree.get(key) ?? 0);
            }
            if (parentKey) {
                // Edge: dep (key) -> parent (parentKey)
                const set = adj.get(key) || new Set();
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
                // Preload dependency entry file before visiting
                const reqRes = await this.registryResolver(req.name, req.range);
                const reqDistBase = this.calculateDistBase(reqRes);
                this.preloadEntryFile(req.name, reqDistBase, depth + 1);
                await visit(req.name, req.range, key, depth + 1);
            }
            // Process import-exposed dependencies (middleware providers, component libraries, etc.)
            const importExposed = manifest["import-exposed"];
            if (importExposed && typeof importExposed === "object") {
                for (const [packageName, modules] of Object.entries(importExposed)) {
                    // Extract semver from any module in this package
                    let semver;
                    if (modules && typeof modules === "object") {
                        // Find the first module with a semver
                        for (const moduleInfo of Object.values(modules)) {
                            if (moduleInfo && typeof moduleInfo === "object" && "semver" in moduleInfo) {
                                semver = moduleInfo.semver;
                                break;
                            }
                        }
                    }
                    // Preload dependency entry file before visiting
                    const importRes = await this.registryResolver(packageName, semver);
                    const importDistBase = this.calculateDistBase(importRes);
                    this.preloadEntryFile(packageName, importDistBase, depth + 1);
                    // Visit this package as a dependency
                    await visit(packageName, semver, key, depth + 1);
                }
            }
            // Process shared-providers dependencies (shared module providers like React)
            const sharedProviders = manifest["shared-providers"];
            if (sharedProviders && typeof sharedProviders === "object") {
                console.debug(`📦 Processing shared-providers for ${name}@${range}:`, Object.keys(sharedProviders));
                for (const [packageName, providerInfo] of Object.entries(sharedProviders)) {
                    // Extract semver from the provider info
                    let semver;
                    if (providerInfo && typeof providerInfo === "object" && "semver" in providerInfo) {
                        semver = providerInfo.semver;
                    }
                    console.debug(`  → Loading shared provider: ${packageName}@${semver || 'latest'}`);
                    // Preload dependency entry file before visiting
                    const sharedRes = await this.registryResolver(packageName, semver);
                    const sharedDistBase = this.calculateDistBase(sharedRes);
                    this.preloadEntryFile(packageName, sharedDistBase, depth + 1);
                    // Visit this package as a dependency
                    await visit(packageName, semver, key, depth + 1);
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
    /**
     * Calculate topological batches for parallel loading
     */
    topoBatches(graph) {
        const { nodes, adj } = graph;
        const indegree = new Map(graph.indegree);
        const q = [];
        for (const n of nodes) {
            if ((indegree.get(n) ?? 0) === 0)
                q.push(n);
        }
        const order = [];
        const batches = [];
        while (q.length) {
            // process a batch (all current zero indegree)
            const batch = q.splice(0, q.length);
            batches.push(batch);
            for (const u of batch) {
                order.push(u);
                for (const v of adj.get(u) ?? []) {
                    indegree.set(v, (indegree.get(v) ?? 0) - 1);
                    if ((indegree.get(v) ?? 0) === 0)
                        q.push(v);
                }
            }
        }
        if (order.length < nodes.size) {
            const cyclic = [...nodes].filter((k) => (indegree.get(k) ?? 0) > 0);
            console.warn(`⚠️ Dependency cycle detected among: ${cyclic.join(", ")} - proceeding with best-effort loading`);
            // Add all cyclic nodes as a final batch
            batches.push(cyclic);
        }
        return batches;
    }
}

/**
 * Bootstrap Coordination Module
 * Handles FynApp bootstrap serialization and dependency coordination
 */
/** Default bootstrap timeout: 30 seconds */
const DEFAULT_BOOTSTRAP_TIMEOUT = 30000;
class BootstrapCoordinator {
    constructor(events, timeout) {
        this.bootstrappingApp = null;
        this.deferredBootstraps = [];
        this.fynAppBootstrapStatus = new Map();
        this.fynAppProviderModes = new Map();
        /** Bootstrap timeout in milliseconds */
        this.timeout = DEFAULT_BOOTSTRAP_TIMEOUT;
        this.events = events;
        if (timeout !== undefined) {
            this.timeout = timeout;
        }
        // Listen for bootstrap completion events
        this.events.on("FYNAPP_BOOTSTRAPPED", (event) => {
            this.handleFynAppBootstrapped(event);
        });
    }
    /**
     * Set bootstrap timeout
     */
    setTimeout(timeout) {
        this.timeout = timeout;
    }
    /**
     * Get current bootstrap timeout
     */
    getTimeout() {
        return this.timeout;
    }
    /**
     * Get current bootstrap state
     */
    getBootstrapState() {
        return {
            bootstrappingApp: this.bootstrappingApp,
            deferredBootstraps: [...this.deferredBootstraps],
            fynAppBootstrapStatus: new Map(this.fynAppBootstrapStatus),
            fynAppProviderModes: new Map(this.fynAppProviderModes),
        };
    }
    /**
     * Check if a FynApp can bootstrap
     */
    canBootstrap(fynApp) {
        return this.bootstrappingApp === null &&
            this.areBootstrapDependenciesSatisfied(fynApp);
    }
    /**
     * Acquire bootstrap lock
     */
    acquireBootstrapLock(fynAppName) {
        if (this.bootstrappingApp !== null) {
            return false;
        }
        this.bootstrappingApp = fynAppName;
        console.debug(`🔒 ${fynAppName} acquired bootstrap lock`);
        return true;
    }
    /**
     * Release bootstrap lock
     */
    releaseBootstrapLock() {
        this.bootstrappingApp = null;
    }
    /**
     * Defer a bootstrap until dependencies are ready
     * If timeout is reached, the FynApp will be skipped with an error
     */
    deferBootstrap(fynApp) {
        const reason = this.bootstrappingApp !== null
            ? `${this.bootstrappingApp} is currently bootstrapping`
            : `waiting for provider dependencies`;
        console.debug(`⏸️ Deferring bootstrap of ${fynApp.name} (${reason})`);
        return new Promise((resolve, reject) => {
            const deferred = {
                fynApp,
                resolve: () => {
                    // Clear timeout when resolved normally
                    if (deferred.timeoutId) {
                        clearTimeout(deferred.timeoutId);
                    }
                    resolve();
                },
            };
            // Set up timeout - party goes on even if this FynApp times out
            deferred.timeoutId = setTimeout(() => {
                // Remove from deferred queue
                const idx = this.deferredBootstraps.indexOf(deferred);
                if (idx >= 0) {
                    this.deferredBootstraps.splice(idx, 1);
                }
                // Log timeout error but don't reject - allow promise to resolve
                // This prevents blocking the entire bootstrap process
                console.error(`⏰ Bootstrap timeout (${this.timeout}ms): ${fynApp.name} timed out waiting for ${reason}. ` +
                    `Skipping this FynApp - the party goes on!`);
                // Emit timeout event for observability
                this.events.dispatchEvent(new CustomEvent("FYNAPP_BOOTSTRAP_TIMEOUT", {
                    detail: {
                        name: fynApp.name,
                        version: fynApp.version,
                        reason,
                        timeout: this.timeout,
                    },
                }));
                // Resolve instead of reject - party goes on!
                // The FynApp just won't be bootstrapped
                resolve();
            }, this.timeout);
            this.deferredBootstraps.push(deferred);
        });
    }
    /**
     * Mark a FynApp as bootstrapped
     */
    markBootstrapped(fynAppName) {
        this.fynAppBootstrapStatus.set(fynAppName, "bootstrapped");
    }
    /**
     * Register provider/consumer mode for a FynApp
     */
    registerProviderMode(fynAppName, middlewareName, mode) {
        if (!this.fynAppProviderModes.has(fynAppName)) {
            this.fynAppProviderModes.set(fynAppName, new Map());
        }
        const modes = this.fynAppProviderModes.get(fynAppName);
        modes.set(middlewareName, mode);
        console.debug(`📝 ${fynAppName} registered as ${mode} for middleware ${middlewareName}`);
    }
    /**
     * Handle FynApp bootstrap completion event
     * Resume any deferred bootstraps that have their dependencies satisfied
     */
    async handleFynAppBootstrapped(event) {
        const { name } = event.detail;
        console.debug(`✅ FynApp ${name} bootstrap complete, checking deferred bootstraps`);
        // Mark this FynApp as bootstrapped
        this.markBootstrapped(name);
        // Clear the currently bootstrapping app
        this.releaseBootstrapLock();
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
        }
        else if (this.deferredBootstraps.length > 0) {
            console.debug(`⏸️ ${this.deferredBootstraps.length} deferred bootstrap(s) still waiting for dependencies`);
        }
    }
    /**
     * Check if a FynApp's bootstrap dependencies are satisfied
     */
    areBootstrapDependenciesSatisfied(fynApp) {
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
                    console.debug(`⏳ ${fynApp.name} waiting for provider ${providerName} to bootstrap (middleware: ${middlewareName})`);
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
    findProviderForMiddleware(middlewareName, excludeFynApp) {
        for (const [fynAppName, modes] of this.fynAppProviderModes.entries()) {
            if (fynAppName === excludeFynApp)
                continue;
            const mode = modes.get(middlewareName);
            if (mode === "provider") {
                return fynAppName;
            }
        }
        return null;
    }
    /**
     * Clear all bootstrap state
     */
    clear() {
        this.bootstrappingApp = null;
        // Clear any pending timeouts
        for (const deferred of this.deferredBootstraps) {
            if (deferred.timeoutId) {
                clearTimeout(deferred.timeoutId);
            }
        }
        this.deferredBootstraps = [];
        this.fynAppBootstrapStatus.clear();
        this.fynAppProviderModes.clear();
    }
}

/**
 * Middleware Management Module
 * Handles middleware registration, versioning, and auto-apply logic
 */
const DummyMiddlewareReg = {
    regKey: "",
};
class MiddlewareManager {
    constructor() {
        this.middlewares = {};
        this.scannedModules = new Set();
    }
    /**
     * Register a middleware implementation with enhanced error handling
     */
    registerMiddleware(mwReg) {
        const { regKey, hostFynApp } = mwReg;
        const versionMap = this.middlewares[regKey] || Object.create(null);
        // Check if this exact middleware version is already registered
        if (versionMap[hostFynApp.version]) {
            console.debug(`⚠️ Middleware already registered: ${regKey}@${hostFynApp.version} - skipping duplicate registration`);
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
        }
        else {
            console.debug(`✅ Registered explicit-use middleware: ${regKey}@${hostFynApp.version}`);
        }
    }
    /**
     * Get middleware by name and provider
     */
    getMiddleware(name, provider) {
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
                const mwReg = versionMap["default"];
                if (mwReg)
                    return mwReg;
            }
        }
        return DummyMiddlewareReg;
    }
    /**
     * Get auto-apply middlewares
     */
    getAutoApplyMiddlewares() {
        return this.autoApplyMiddlewares;
    }
    /**
     * Get middlewares for a specific FynApp type
     */
    getTargetMiddlewares(isMiddlewareProvider) {
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
    hasScannedModule(scanCacheKey) {
        return this.scannedModules.has(scanCacheKey);
    }
    /**
     * Mark a module as scanned for middleware
     */
    markModuleScanned(scanCacheKey) {
        this.scannedModules.add(scanCacheKey);
    }
    /**
     * Scan and register middleware exports from a module
     */
    scanAndRegisterMiddleware(fynApp, exposeName, exposedModule) {
        const scanCacheKey = `${fynApp.name}@${fynApp.version}::${exposeName}`;
        // Check if we've already scanned this module
        if (this.hasScannedModule(scanCacheKey)) {
            console.debug(`⏭️  Skipping middleware scan for '${exposeName}' - already scanned for`, fynApp.name, fynApp.version);
            return [];
        }
        // Mark as scanned before processing to prevent duplicate scans
        this.markModuleScanned(scanCacheKey);
        const mwExports = [];
        for (const [exportName, exportValue] of Object.entries(exposedModule)) {
            if (exportName.startsWith("__middleware__")) {
                const middleware = exportValue;
                const mwName = middleware.name;
                const mwReg = {
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
        console.debug(`✅ Expose module '${exposeName}' loaded for`, fynApp.name, fynApp.version, mwExports.length > 0 ? "middlewares registered:" : "", mwExports.join(", "));
        return mwExports;
    }
    /**
     * Initialize runtime with middleware data
     */
    initializeFromRuntime(runtime) {
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
    exportToRuntime() {
        return {
            middlewares: this.middlewares,
            autoApplyMiddlewares: this.autoApplyMiddlewares,
        };
    }
    /**
     * Clear all middleware state
     */
    clear() {
        this.middlewares = {};
        this.autoApplyMiddlewares = undefined;
        this.scannedModules.clear();
    }
}

/**
 * Kernel Error Module
 * Standardized error types for FynMesh Kernel with error codes
 */
/**
 * Error codes for kernel errors
 */
var KernelErrorCode;
(function (KernelErrorCode) {
    // Module Loading Errors (1xxx)
    KernelErrorCode[KernelErrorCode["MODULE_NOT_FOUND"] = 1001] = "MODULE_NOT_FOUND";
    KernelErrorCode[KernelErrorCode["MODULE_LOAD_FAILED"] = 1002] = "MODULE_LOAD_FAILED";
    KernelErrorCode[KernelErrorCode["EXPOSE_MODULE_NOT_FOUND"] = 1003] = "EXPOSE_MODULE_NOT_FOUND";
    KernelErrorCode[KernelErrorCode["DEPENDENCY_NOT_FOUND"] = 1004] = "DEPENDENCY_NOT_FOUND";
    // Middleware Errors (2xxx)
    KernelErrorCode[KernelErrorCode["MIDDLEWARE_NOT_FOUND"] = 2001] = "MIDDLEWARE_NOT_FOUND";
    KernelErrorCode[KernelErrorCode["MIDDLEWARE_SETUP_FAILED"] = 2002] = "MIDDLEWARE_SETUP_FAILED";
    KernelErrorCode[KernelErrorCode["MIDDLEWARE_APPLY_FAILED"] = 2003] = "MIDDLEWARE_APPLY_FAILED";
    KernelErrorCode[KernelErrorCode["MIDDLEWARE_FILTER_ERROR"] = 2004] = "MIDDLEWARE_FILTER_ERROR";
    // Bootstrap Errors (3xxx)
    KernelErrorCode[KernelErrorCode["BOOTSTRAP_FAILED"] = 3001] = "BOOTSTRAP_FAILED";
    KernelErrorCode[KernelErrorCode["REGISTRY_RESOLVER_MISSING"] = 3002] = "REGISTRY_RESOLVER_MISSING";
    // Manifest Errors (4xxx)
    KernelErrorCode[KernelErrorCode["MANIFEST_FETCH_FAILED"] = 4001] = "MANIFEST_FETCH_FAILED";
    KernelErrorCode[KernelErrorCode["MANIFEST_PARSE_FAILED"] = 4002] = "MANIFEST_PARSE_FAILED";
    // Federation Errors (5xxx)
    KernelErrorCode[KernelErrorCode["FEDERATION_NOT_LOADED"] = 5001] = "FEDERATION_NOT_LOADED";
    KernelErrorCode[KernelErrorCode["FEDERATION_ENTRY_FAILED"] = 5002] = "FEDERATION_ENTRY_FAILED";
})(KernelErrorCode || (KernelErrorCode = {}));
/**
 * Base error class for all kernel errors
 */
class KernelError extends Error {
    constructor(code, message, options) {
        super(message);
        this.name = "KernelError";
        this.code = code;
        this.context = options?.context;
        this.cause = options?.cause;
        // Maintains proper stack trace for where error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
    /**
     * Get a formatted error message with context
     */
    toDetailedString() {
        let result = `[${this.name}:${this.code}] ${this.message}`;
        if (this.context) {
            result += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
        }
        if (this.cause) {
            result += `\nCaused by: ${this.cause.message}`;
        }
        return result;
    }
}
/**
 * Error for module loading failures
 */
class ModuleLoadError extends KernelError {
    constructor(code, message, options) {
        super(code, message, {
            context: {
                fynAppName: options?.fynAppName,
                fynAppVersion: options?.fynAppVersion,
                exposeName: options?.exposeName,
            },
            cause: options?.cause,
        });
        this.name = "ModuleLoadError";
    }
}
/**
 * Error for middleware-related failures
 */
class MiddlewareError extends KernelError {
    constructor(code, message, options) {
        super(code, message, {
            context: {
                middlewareName: options?.middlewareName,
                provider: options?.provider,
                fynAppName: options?.fynAppName,
            },
            cause: options?.cause,
        });
        this.name = "MiddlewareError";
    }
}
/**
 * Helper to create success result
 */
function ok(value) {
    return { success: true, value };
}
/**
 * Helper to create error result
 */
function err(error) {
    return { success: false, error };
}

/**
 * Module Loading Module
 * Handles FynApp module loading and execution
 */
class ModuleLoader {
    constructor() {
        this.scannedModules = new Set();
    }
    /**
     * Load an expose module from a FynApp
     * @returns Result with the loaded module or an error
     */
    async loadExposeModule(fynApp, exposeName, loadMiddlewares, middlewareRegistrar) {
        const container = fynApp.entry.container;
        if (!container?.$E[exposeName]) {
            const error = new ModuleLoadError(KernelErrorCode.EXPOSE_MODULE_NOT_FOUND, `No expose module '${exposeName}' found for ${fynApp.name}@${fynApp.version}`, {
                fynAppName: fynApp.name,
                fynAppVersion: fynApp.version,
                exposeName,
            });
            console.debug(`❌ ${error.message}`);
            return err(error);
        }
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
                        const middleware = exportValue;
                        const mwName = middleware.name;
                        const mwReg = {
                            regKey: `${fynApp.name}::${mwName}`,
                            fullKey: `${fynApp.name}@${fynApp.version}::${mwName}`,
                            hostFynApp: fynApp,
                            exposeName: exposeName,
                            exportName,
                            middleware,
                        };
                        // Register middleware using the provided registrar
                        if (middlewareRegistrar) {
                            middlewareRegistrar(mwReg);
                        }
                        mwExports.push(exportName);
                    }
                }
                console.debug(`✅ Expose module '${exposeName}' loaded for`, fynApp.name, fynApp.version, mwExports.length > 0 ? "middlewares registered:" : "", mwExports.join(", "));
            }
            else {
                console.debug(`⏭️  Skipping middleware scan for '${exposeName}' - already scanned for`, fynApp.name, fynApp.version);
            }
            fynApp.exposes[exposeName] = exposedModule;
            if (exposedModule.__name) {
                fynApp.exposes[exposedModule.__name] = exposedModule;
            }
            return ok(exposedModule);
        }
        // Module loaded but no middleware processing needed
        return ok(exposedModule);
    }
    /**
     * Load middleware from a dependency package
     * @returns Result indicating success or error with details
     */
    async loadMiddlewareFromDependency(packageName, middlewarePath, appsLoaded, middlewareRegistrar) {
        console.debug(`📦 Loading middleware from dependency: ${packageName}/${middlewarePath}`);
        // Find the dependency fynapp
        const dependencyApp = appsLoaded[packageName];
        if (!dependencyApp) {
            const error = new ModuleLoadError(KernelErrorCode.DEPENDENCY_NOT_FOUND, `Dependency package ${packageName} not found in runtime`, {
                fynAppName: packageName,
                exposeName: middlewarePath,
            });
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
        const result = await this.loadExposeModule(dependencyApp, exposeName, true, middlewareRegistrar);
        if (!result.success) {
            return err(result.error);
        }
        return ok(undefined);
    }
    /**
     * Load the basics of a FynApp
     */
    async loadFynAppBasics(fynAppEntry, appsLoaded, middlewareRegistrar) {
        const container = fynAppEntry.container;
        console.debug("🚀 Initializing FynApp entry", container.name, container.version);
        // Step 1: Initialize the entry
        fynAppEntry.init();
        console.debug("🚀 Loading FynApp basics for", container.name, container.version);
        // Step 2: Create FynApp object early for event processing
        const fynApp = {
            name: container.name,
            version: container.version || "1.0.0",
            packageName: container.name,
            entry: fynAppEntry,
            middlewareContext: new Map(),
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
        const mainResult = await this.loadExposeModule(fynApp, "./main", true, middlewareRegistrar);
        if (!mainResult.success) {
            // Main module not found is not fatal - some FynApps may not have a main module
            console.debug(`⚠️ Main module not loaded for ${fynApp.name}: ${mainResult.error.message}`);
        }
        // Step 6: Proactively load middleware from dependencies
        // Get the embedded manifest from the container
        // The manifest is exported directly on the container, not as an expose module
        const manifest = container.__FYNAPP_MANIFEST__ || null;
        const importExposed = manifest?.["import-exposed"];
        if (importExposed && typeof importExposed === "object") {
            console.debug("📦 Loading middleware dependencies for", fynApp.name);
            // Collect errors for reporting but continue loading other dependencies
            const loadErrors = [];
            for (const [packageName, modules] of Object.entries(importExposed)) {
                if (modules && typeof modules === "object") {
                    for (const [modulePath, moduleInfo] of Object.entries(modules)) {
                        // Only load middleware type dependencies
                        if (moduleInfo && typeof moduleInfo === "object" && moduleInfo.type === "middleware") {
                            // The modulePath key is already the correct exposed module path (e.g., "middleware/design-tokens")
                            // which corresponds to the "./middleware/design-tokens" expose
                            console.debug(`📦 Proactively loading middleware: ${packageName}/${modulePath}`);
                            const depResult = await this.loadMiddlewareFromDependency(packageName, modulePath, appsLoaded, middlewareRegistrar);
                            if (!depResult.success) {
                                loadErrors.push(depResult.error);
                            }
                        }
                    }
                }
            }
            // Log collected errors but don't fail - middleware deps may be optional
            if (loadErrors.length > 0) {
                console.debug(`⚠️ ${loadErrors.length} middleware dependency load error(s) for ${fynApp.name}:`, loadErrors.map(e => e.message));
            }
        }
        console.debug("✅ FynApp basics loaded for", fynApp.name, fynApp.version);
        // Record app in runtime registry for observability
        appsLoaded[fynApp.name] = fynApp;
        return fynApp;
    }
    /**
     * Create a FynUnit runtime
     */
    createFynUnitRuntime(fynApp) {
        return {
            fynApp,
            middlewareContext: new Map(),
        };
    }
    /**
     * @deprecated Use createFynUnitRuntime instead
     */
    createFynModuleRuntime(fynApp) {
        return this.createFynUnitRuntime(fynApp);
    }
    /**
     * Find execution override middleware
     */
    findExecutionOverride(fynApp, fynUnit, autoApplyMiddlewares) {
        if (!autoApplyMiddlewares)
            return null;
        // Check middleware that auto-applies to this FynApp type
        const isMiddlewareProvider = Object.keys(fynApp.exposes).some(key => key.startsWith('./middleware'));
        const targetMiddlewares = isMiddlewareProvider
            ? autoApplyMiddlewares.middleware
            : autoApplyMiddlewares.fynapp;
        // Find first middleware that can override execution
        for (const mwReg of targetMiddlewares) {
            if (mwReg.middleware.canOverrideExecution?.(fynApp, fynUnit)) {
                return mwReg;
            }
        }
        return null;
    }
    /**
     * Invoke a FynUnit
     */
    async invokeFynUnit(fynUnit, fynApp, autoApplyMiddlewares) {
        const runtime = this.createFynUnitRuntime(fynApp);
        // Check for middleware execution overrides
        const executionOverride = this.findExecutionOverride(fynApp, fynUnit, autoApplyMiddlewares);
        if (executionOverride) {
            console.debug(`🎭 Middleware ${executionOverride.middleware.name} is overriding execution for ${fynApp.name}`);
            const context = {
                meta: {
                    info: {
                        name: executionOverride.middleware.name,
                        provider: executionOverride.hostFynApp.name,
                        version: executionOverride.hostFynApp.version
                    },
                    config: {}
                },
                fynUnit,
                fynMod: fynUnit, // deprecated compatibility
                fynApp,
                reg: executionOverride,
                runtime,
                kernel: null, // Kernel reference injected by caller
                status: "ready",
            };
            // Let middleware handle initialize
            if (executionOverride.middleware.overrideInitialize && fynUnit.initialize) {
                console.debug(`🎭 Middleware overriding initialize for ${fynApp.name}`);
                const initResult = await executionOverride.middleware.overrideInitialize(context);
                console.debug(`🎭 Initialize result:`, initResult);
            }
            // Let middleware handle execute
            if (executionOverride.middleware.overrideExecute && typeof fynUnit.execute === 'function') {
                console.debug(`🎭 Middleware overriding execute for ${fynApp.name}`);
                await executionOverride.middleware.overrideExecute(context);
            }
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
            const executeResult = await fynUnit.execute(runtime);
            // Handle execution result - middleware defines contract, kernel just passes through
            if (executeResult) {
                console.debug(`📦 FynUnit returned result:`, typeof executeResult === 'object' ? executeResult.type : typeof executeResult);
            }
        }
    }
    /**
     * @deprecated Use invokeFynUnit instead
     */
    async invokeFynModule(fynMod, fynApp, autoApplyMiddlewares) {
        return this.invokeFynUnit(fynMod, fynApp, autoApplyMiddlewares);
    }
    /**
     * Clear module loader state
     */
    clear() {
        this.scannedModules.clear();
    }
}

/**
 * Middleware Execution Module
 * Handles middleware execution, defer/retry logic, and ready state management
 */
class MiddlewareExecutor {
    constructor() {
        this.middlewareReady = new Map();
        this.deferInvoke = [];
    }
    /**
     * Set middleware as ready
     */
    setMiddlewareReady(fullKey, share) {
        this.middlewareReady.set(fullKey, share);
    }
    /**
     * Find execution override middleware
     */
    findExecutionOverride(fynApp, fynUnit, autoApplyMiddlewares) {
        if (!autoApplyMiddlewares)
            return null;
        // Check middleware that auto-applies to this FynApp type
        const isMiddlewareProvider = Object.keys(fynApp.exposes).some(key => key.startsWith('./middleware'));
        const targetMiddlewares = isMiddlewareProvider
            ? autoApplyMiddlewares.middleware
            : autoApplyMiddlewares.fynapp;
        // Find first middleware that can override execution
        for (const mwReg of targetMiddlewares) {
            if (mwReg.middleware.canOverrideExecution?.(fynApp, fynUnit)) {
                return mwReg;
            }
        }
        return null;
    }
    /**
     * Check if a single middleware is ready
     */
    checkSingleMiddlewareReady(cc) {
        if (this.middlewareReady.has(cc.reg.fullKey)) {
            cc.runtime.share = this.middlewareReady.get(cc.reg.fullKey);
            cc.status = "ready";
            return true;
        }
        return false;
    }
    /**
     * Check if all middlewares in the list are ready
     */
    checkMiddlewareReady(ccs) {
        let status = "ready";
        for (const cc of ccs) {
            if (!this.checkSingleMiddlewareReady(cc)) {
                status = "defer";
            }
        }
        return status;
    }
    /**
     * Check and handle deferred calls
     */
    checkDeferCalls(status, ccs) {
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
    /**
     * Process ready middlewares when one becomes ready
     */
    processReadyMiddleware(readyKey, share) {
        this.setMiddlewareReady(readyKey, share);
        // Optimized: Use a Map to track ready status instead of O(n²) loops
        const resumeIndices = [];
        for (let i = 0; i < this.deferInvoke.length; i++) {
            const { callContexts } = this.deferInvoke[i];
            let allReady = true;
            for (const deferCC of callContexts) {
                if (deferCC.reg.fullKey === readyKey) {
                    deferCC.runtime.share = share;
                    deferCC.status = "ready";
                }
                // Check if all contexts are ready
                if (deferCC.status !== "ready" && deferCC.status !== "skip") {
                    allReady = false;
                }
            }
            if (allReady) {
                resumeIndices.push(i);
            }
        }
        // Process resumes and clean up in reverse order to maintain indices
        const resumes = [];
        if (resumeIndices.length > 0) {
            for (let i = resumeIndices.length - 1; i >= 0; i--) {
                const idx = resumeIndices[i];
                resumes.push(this.deferInvoke[idx]);
                this.deferInvoke.splice(idx, 1);
            }
            // Resume in original order
            resumes.reverse();
        }
        return { resumes };
    }
    /**
     * Call middlewares with setup and apply
     */
    async callMiddlewares(ccs, signalReady, providerModeRegistrar, autoApplyMiddlewares, tries = 0) {
        // Handle empty middleware array - nothing to call
        if (ccs.length === 0) {
            console.debug("⚠️ No middleware contexts to call, skipping middleware setup");
            return "ready";
        }
        if (tries > 1) {
            const mwError = new MiddlewareError(KernelErrorCode.MIDDLEWARE_SETUP_FAILED, `Middleware setup failed after 2 tries for ${ccs.map(cc => cc.reg.regKey).join(", ")}`, {
                middlewareName: ccs[0]?.reg.middleware.name,
                provider: ccs[0]?.reg.hostFynApp.name,
                fynAppName: ccs[0]?.fynApp.name,
            });
            console.error(`🚨 ${mwError.message}`);
            throw mwError;
        }
        this.checkMiddlewareReady(ccs);
        let status = "ready";
        for (const cc of ccs) {
            const { fynApp, reg } = cc;
            const mw = reg.middleware;
            this.checkSingleMiddlewareReady(cc);
            if (mw.setup) {
                console.debug("🚀 Invoking middleware", reg.regKey, "setup for", fynApp.name, fynApp.version);
                const result = await mw.setup(cc);
                // Auto-signal if middleware reports ready and didn't already signal via event
                if (result?.status === "ready" && !this.middlewareReady.has(cc.reg.fullKey)) {
                    if (signalReady) {
                        await signalReady(cc, result?.share);
                    }
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
            return await this.callMiddlewares(ccs, signalReady, providerModeRegistrar, autoApplyMiddlewares, tries + 1);
        }
        const fynUnit = ccs[0].fynUnit;
        const fynApp = ccs[0].fynApp;
        const runtime = ccs[0].runtime;
        if (fynUnit.initialize) {
            console.debug("🚀 Invoking unit.initialize for", fynApp.name, fynApp.version);
            const result = await fynUnit.initialize(runtime);
            // Capture provider/consumer mode for dependency tracking
            if (result?.mode && providerModeRegistrar) {
                // Store mode for each middleware this FynApp uses
                for (const cc of ccs) {
                    providerModeRegistrar(fynApp.name, cc.reg.middleware.name, result.mode);
                }
                console.debug(`📝 ${fynApp.name} registered as ${result.mode} for middleware(s)`);
            }
            status = this.checkDeferCalls(result?.status, ccs);
            if (status === "defer") {
                // Check if app declared it can handle deferred middleware
                if (result?.deferOk) {
                    console.debug(`✅ ${fynApp.name} declared deferOk=true, continuing execution despite deferred middleware`);
                    // Continue to execution - don't return defer
                    // The app will render with degraded functionality and can upgrade later
                }
                else {
                    // User initialize requested defer and middleware not all ready: respect defer
                    return "defer";
                }
            }
            if (status === "retry") {
                if (result?.status === "defer") {
                    return await this.callMiddlewares(ccs, signalReady, providerModeRegistrar, autoApplyMiddlewares, tries + 1);
                }
                return await this.callMiddlewares(ccs, signalReady, providerModeRegistrar, autoApplyMiddlewares, tries + 1);
            }
        }
        for (const cc of ccs) {
            const { reg } = cc;
            const mw = reg.middleware;
            if (mw.apply) {
                console.debug("🚀 Invoking middleware", reg.regKey, "apply for", fynApp.name, fynApp.version);
                await mw.apply(cc);
            }
        }
        // Check for execution override AFTER middleware setup/apply
        const executionOverride = this.findExecutionOverride(fynApp, fynUnit, autoApplyMiddlewares);
        if (executionOverride) {
            console.debug(`🎭 Middleware ${executionOverride.middleware.name} is overriding execution for ${fynApp.name}`);
            const overrideContext = {
                meta: {
                    info: {
                        name: executionOverride.middleware.name,
                        provider: executionOverride.hostFynApp.name,
                        version: executionOverride.hostFynApp.version
                    },
                    config: {}
                },
                fynUnit,
                fynMod: fynUnit, // deprecated compatibility
                fynApp,
                reg: executionOverride,
                runtime,
                kernel: ccs[0].kernel,
                status: "ready",
            };
            // Let middleware handle initialize first
            if (executionOverride.middleware.overrideInitialize && fynUnit.initialize) {
                console.debug(`🎭 Middleware overriding initialize for ${fynApp.name}`);
                const initResult = await executionOverride.middleware.overrideInitialize(overrideContext);
                console.debug(`🎭 Initialize result:`, initResult);
            }
            // Let middleware handle execute
            if (executionOverride.middleware.overrideExecute && typeof fynUnit.execute === 'function') {
                console.debug(`🎭 Middleware overriding execute for ${fynApp.name}`);
                await executionOverride.middleware.overrideExecute(overrideContext);
            }
        }
        else {
            // Normal execution when no override is present
            if (fynUnit.execute) {
                console.debug("🚀 Invoking unit.execute for", fynApp.name, fynApp.version);
                await fynUnit.execute(runtime);
            }
        }
        return "ready";
    }
    /**
     * Parse middleware string format and create call context
     * @private
     */
    async parseMiddlewareString(middlewareStr, config, fynUnit, fynApp, kernel, runtime, getMiddleware, loadMiddlewareFromDependency) {
        const parts = middlewareStr.trim().split(' ');
        if (parts.length < 3 || parts[0] !== '-FYNAPP_MIDDLEWARE') {
            return null;
        }
        const [, packageName, middlewarePath, semver] = parts;
        const middlewareName = middlewarePath.split('/').pop() || middlewarePath;
        console.debug("🔍 Middleware string - package:", packageName, "middleware:", middlewarePath, "semver:", semver || "any");
        // Try to load middleware from dependency package first
        if (loadMiddlewareFromDependency) {
            await loadMiddlewareFromDependency(packageName, middlewarePath);
        }
        const reg = getMiddleware(middlewareName, packageName);
        if (reg.regKey === "") {
            console.debug("❌ No middleware found for", middlewareName, packageName);
            return null;
        }
        return {
            meta: {
                info: {
                    name: middlewareName,
                    provider: packageName,
                    version: semver || "*"
                },
                config: config || {}
            },
            fynUnit,
            fynMod: fynUnit, // deprecated compatibility
            fynApp,
            reg,
            kernel,
            runtime,
            status: "",
        };
    }
    /**
     * Use middleware on FynUnit
     */
    async useMiddlewareOnFynUnit(fynUnit, fynApp, kernel, createRuntime, getMiddleware, loadMiddlewareFromDependency, autoApplyMiddlewares) {
        if (!fynUnit.__middlewareMeta) {
            return "";
        }
        const runtime = createRuntime();
        console.debug("🔍 Processing middleware metadata:", fynUnit.__middlewareMeta);
        const ccs = [];
        for (const meta of fynUnit.__middlewareMeta) {
            console.debug("🔍 Processing meta item:", meta);
            let cc = null;
            // Handle new string format: "-FYNAPP_MIDDLEWARE package-name middleware-path [semver]"
            if (typeof meta === 'string') {
                cc = await this.parseMiddlewareString(meta, {}, fynUnit, fynApp, kernel, runtime, getMiddleware, loadMiddlewareFromDependency);
            }
            else if (meta && typeof meta === 'object') {
                console.debug("🔍 Object format meta:", meta);
                // Check for new format with middleware property containing the string
                if (meta.middleware && typeof meta.middleware === 'string') {
                    cc = await this.parseMiddlewareString(meta.middleware, meta.config || {}, fynUnit, fynApp, kernel, runtime, getMiddleware, loadMiddlewareFromDependency);
                }
                else if (meta.info) {
                    // Handle legacy object format with info property
                    const info = meta.info;
                    console.debug("🔍 Legacy format - name:", info.name, "provider:", info.provider);
                    const reg = getMiddleware(info.name, info.provider);
                    if (reg.regKey === "") {
                        console.debug("❌ No middleware found for", info.name, info.provider);
                        continue;
                    }
                    cc = {
                        meta: meta,
                        fynUnit,
                        fynMod: fynUnit, // deprecated compatibility
                        fynApp,
                        reg,
                        kernel,
                        runtime,
                        status: "",
                    };
                }
                else {
                    console.debug("❌ Object format missing both middleware and info properties:", meta);
                }
            }
            if (cc) {
                ccs.push(cc);
            }
            else {
                console.debug("❌ Unrecognized middleware meta format:", meta);
            }
        }
        console.debug("✅ Created", ccs.length, "middleware call contexts");
        return this.callMiddlewares(ccs, undefined, undefined, autoApplyMiddlewares);
    }
    /**
     * @deprecated Use useMiddlewareOnFynUnit instead
     */
    async useMiddlewareOnFynModule(fynMod, fynApp, kernel, createRuntime, getMiddleware, loadMiddlewareFromDependency, autoApplyMiddlewares) {
        return this.useMiddlewareOnFynUnit(fynMod, fynApp, kernel, createRuntime, getMiddleware, loadMiddlewareFromDependency, autoApplyMiddlewares);
    }
    /**
     * Apply auto-scope middlewares
     * @returns Array of errors that occurred during middleware application (empty if all succeeded)
     */
    async applyAutoScopeMiddlewares(fynApp, fynUnit, kernel, autoApplyMiddlewares, createRuntime, signalReady) {
        const errors = [];
        console.log(`🎯 Auto-apply check for ${fynApp.name}: autoApplyMiddlewares exists?`, !!autoApplyMiddlewares);
        if (!autoApplyMiddlewares) {
            console.log(`⏭️ No auto-apply middlewares registered yet for ${fynApp.name}`);
            return errors;
        }
        // Apply middleware based on FynApp type
        const targetMiddlewares = isFynAppMiddlewareProvider(fynApp)
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
                }
                catch (error) {
                    const mwError = new MiddlewareError(KernelErrorCode.MIDDLEWARE_FILTER_ERROR, `Error in shouldApply for ${mwReg.regKey}: ${error instanceof Error ? error.message : String(error)}`, {
                        middlewareName: mwReg.middleware.name,
                        provider: mwReg.hostFynApp.name,
                        fynAppName: fynApp.name,
                        cause: error instanceof Error ? error : undefined,
                    });
                    console.error(`❌ ${mwError.message}`);
                    errors.push(mwError);
                    continue;
                }
            }
            console.debug(`🔄 Auto-applying ${mwReg.middleware.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`);
            const unit = fynUnit || { async execute() { } };
            const context = {
                meta: {
                    info: {
                        name: mwReg.middleware.name,
                        provider: mwReg.hostFynApp.name,
                        version: mwReg.hostFynApp.version,
                    },
                    config: {},
                },
                fynUnit: unit,
                fynMod: unit, // deprecated compatibility
                fynApp,
                reg: mwReg,
                runtime: createRuntime(),
                kernel,
                status: "ready",
            };
            try {
                if (mwReg.middleware.setup) {
                    const result = await mwReg.middleware.setup(context);
                    if (result?.status === "ready" && signalReady) {
                        await signalReady(context, result.share);
                    }
                }
                if (mwReg.middleware.apply) {
                    await mwReg.middleware.apply(context);
                }
            }
            catch (error) {
                const mwError = new MiddlewareError(KernelErrorCode.MIDDLEWARE_APPLY_FAILED, `Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}: ${error instanceof Error ? error.message : String(error)}`, {
                    middlewareName: mwReg.middleware.name,
                    provider: mwReg.hostFynApp.name,
                    fynAppName: fynApp.name,
                    cause: error instanceof Error ? error : undefined,
                });
                console.error(`❌ ${mwError.message}`);
                errors.push(mwError);
            }
        }
        return errors;
    }
    /**
     * Clear executor state
     */
    clear() {
        this.middlewareReady.clear();
        this.deferInvoke = [];
    }
    /**
     * Get deferred invokes
     */
    getDeferredInvokes() {
        return [...this.deferInvoke];
    }
    /**
     * Get ready middleware
     */
    getReadyMiddleware() {
        return new Map(this.middlewareReady);
    }
}

/**
 * FynMesh Kernel Core - Refactored Version
 * Now using extracted modules for better maintainability
 */
/**
 * Abstract base class for FynMesh kernel implementations
 * Now using modular architecture with extracted components
 */
class FynMeshKernelCore {
    constructor() {
        this.version = "1.0.0";
        this.shareScopeName = fynMeshShareScope;
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
        this.events.on("MIDDLEWARE_READY", (event) => {
            this.handleMiddlewareReady(event);
        });
    }
    /**
     * Send an event to the kernel
     */
    async emitAsync(event) {
        return this.events.dispatchEvent(event);
    }
    /**
     * Install a registry resolver (browser: demo server paths)
     */
    setRegistryResolver(resolver) {
        this.manifestResolver.setRegistryResolver(resolver);
    }
    /**
     * Set callback for preloading entry files
     */
    setPreloadCallback(callback) {
        this.manifestResolver.setPreloadCallback(callback);
    }
    /**
     * Programmatic API for middlewares to signal readiness
     */
    async signalMiddlewareReady(cc, detail = {}) {
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
    async handleMiddlewareReady(event) {
        const { name, status, cc, share } = event.detail;
        const _share = share || {};
        // Use middleware executor to process ready middleware
        const { resumes } = this.middlewareExecutor.processReadyMiddleware(cc.reg.fullKey, _share);
        // Resume any deferred middleware calls
        for (const resume of resumes) {
            await this.middlewareExecutor.callMiddlewares(resume.callContexts, async (cc, share) => this.signalMiddlewareReady(cc, { share }), (fynAppName, middlewareName, mode) => this.bootstrapCoordinator.registerProviderMode(fynAppName, middlewareName, mode));
        }
        console.debug(`✅ Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`);
    }
    /**
     * Load FynApps by name using manifests and dependency graph
     */
    async loadFynAppsByName(requests, options) {
        // Preload initial FynApp entry files before building dependency graph
        // This allows the initial batch to start loading in parallel
        const preloadCallback = this.manifestResolver["preloadCallback"];
        if (preloadCallback) {
            for (const req of requests) {
                const res = await this.manifestResolver["registryResolver"](req.name, req.range);
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
                const meta = allMeta.get(key);
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
    registerMiddleware(mwReg) {
        this.middlewareManager.registerMiddleware(mwReg);
        // Update runtime
        const exported = this.middlewareManager.exportToRuntime();
        this.runTime.middlewares = exported.middlewares;
        this.runTime.autoApplyMiddlewares = exported.autoApplyMiddlewares;
    }
    /**
     * Get middleware by name and provider
     */
    getMiddleware(name, provider) {
        return this.middlewareManager.getMiddleware(name, provider);
    }
    /**
     * Initialize the kernel runtime data
     */
    initRunTime(data) {
        this.runTime = { ...data };
        this.middlewareManager.initializeFromRuntime(data);
        return this.runTime;
    }
    /**
     * Clean up a container name to ensure it's a valid identifier
     */
    cleanContainerName(name) {
        return name.replace(/[\@\-./]/g, "_").replace(/^_*/, "");
    }
    /**
     * Load FynApp basics
     */
    async loadFynAppBasics(fynAppEntry) {
        return this.moduleLoader.loadFynAppBasics(fynAppEntry, this.runTime.appsLoaded, (mwReg) => this.registerMiddleware(mwReg));
    }
    /**
     * Validate and normalize a main export into a FynUnit
     * - Functions are wrapped as { execute: fn }
     * - Objects with execute method pass through
     * - Invalid exports throw descriptive errors
     */
    validateFynUnit(mainExport, fynAppName) {
        if (typeof mainExport === "function") {
            // Path 1: Simple function - wrap as FynUnit
            return { execute: mainExport };
        }
        if (mainExport && typeof mainExport.execute === "function") {
            // Path 2: Object with execute method - valid FynUnit
            return mainExport;
        }
        throw new Error(`${fynAppName}: main export must be a function or have an execute method. ` +
            `Got: ${typeof mainExport}${mainExport ? ` with keys: ${Object.keys(mainExport).join(", ")}` : ""}`);
    }
    /**
     * Bootstrap a fynapp
     */
    async bootstrapFynApp(fynApp) {
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
                    await this.moduleLoader.loadExposeModule(fynApp, exposeName, true, (mwReg) => this.registerMiddleware(mwReg));
                }
            }
            const mainExport = fynApp.exposes["./main"]?.main;
            if (mainExport) {
                console.debug("🚀 Bootstrapping FynApp", fynApp.name, fynApp.version);
                // Validate and normalize to FynUnit
                const fynUnit = this.validateFynUnit(mainExport, fynApp.name);
                // Apply auto-scope middlewares
                const middlewareErrors = await this.middlewareExecutor.applyAutoScopeMiddlewares(fynApp, fynUnit, this, this.middlewareManager.getAutoApplyMiddlewares(), () => this.moduleLoader.createFynUnitRuntime(fynApp), async (cc, share) => this.signalMiddlewareReady(cc, { share }));
                // Log middleware errors but don't fail bootstrap - middleware issues shouldn't break the app
                if (middlewareErrors.length > 0) {
                    console.warn(`⚠️ ${middlewareErrors.length} middleware error(s) during bootstrap of ${fynApp.name}:`, middlewareErrors.map(e => e.toDetailedString()));
                }
                // Simplified 2-path execution:
                // Path A: FynUnit with __middlewareMeta - full middleware coordination
                // Path B: FynUnit without __middlewareMeta - direct execution with auto-apply only
                if (fynUnit.__middlewareMeta) {
                    // Path A: Full middleware coordination
                    await this.middlewareExecutor.useMiddlewareOnFynUnit(fynUnit, fynApp, this, () => this.moduleLoader.createFynUnitRuntime(fynApp), (name, provider) => this.getMiddleware(name, provider), async (packageName, middlewarePath) => {
                        await this.moduleLoader.loadMiddlewareFromDependency(packageName, middlewarePath, this.runTime.appsLoaded, (mwReg) => this.registerMiddleware(mwReg));
                    }, this.middlewareManager.getAutoApplyMiddlewares());
                }
                else {
                    // Path B: Direct execution with auto-apply middleware only
                    await this.moduleLoader.invokeFynUnit(fynUnit, fynApp, this.middlewareManager.getAutoApplyMiddlewares());
                }
            }
            console.debug("✅ FynApp bootstrapped", fynApp.name, fynApp.version);
            // Emit bootstrap complete event
            await this.emitAsync(new CustomEvent("FYNAPP_BOOTSTRAPPED", {
                detail: { name: fynApp.name, version: fynApp.version },
            }));
        }
        catch (error) {
            // Error isolation: Log error but don't crash the kernel
            console.error(`❌ Bootstrap failed for ${fynApp.name}:`, error);
            // Emit failure event so other systems can react
            await this.emitAsync(new CustomEvent("FYNAPP_BOOTSTRAP_FAILED", {
                detail: { name: fynApp.name, version: fynApp.version, error },
            }));
            // Release lock so other FynApps can continue - party goes on!
            this.bootstrapCoordinator.releaseBootstrapLock();
            // Don't rethrow - allow other FynApps to bootstrap
            // The error has been logged and an event emitted for observability
        }
    }
    /**
     * Protected helper to build fynapp URL
     */
    buildFynAppUrl(baseUrl, entryFile = "fynapp-entry.js") {
        return urlJoin(baseUrl, entryFile);
    }
}

/**
 * Node.js-specific implementation of FynMesh kernel
 * Handles Node.js-specific module loading and federation
 */
class NodeKernel extends FynMeshKernelCore {
    /**
     * Load a remote fynapp in Node.js environment
     * Returns the loaded FynApp after bootstrapping
     */
    async loadFynApp(baseUrl, loadId) {
        const urlPath = this.buildFynAppUrl(baseUrl);
        try {
            // Node.js-specific loading logic
            // This could use dynamic imports, require, or a Node.js federation library
            // For now, we'll use dynamic import as a starting point
            const fynAppEntry = await import(__rewriteRelativeImportExtension(urlPath));
            const fynApp = await this.loadFynAppBasics(fynAppEntry);
            await this.bootstrapFynApp(fynApp);
            return fynApp;
        }
        catch (err) {
            console.error(`Failed to load remote fynapp from ${baseUrl} in Node.js:`, err);
            throw err;
        }
    }
}
/**
 * Create and initialize a Node.js kernel instance
 */
function createNodeKernel() {
    const kernel = new NodeKernel();
    // Initialize kernel runtime
    kernel.initRunTime({
        appsLoaded: {},
        middlewares: {},
    });
    return kernel;
}

/**
 * Global Node.js kernel instance attached to globalThis
 */
const fynMeshKernel = createNodeKernel();

export { fynMeshKernel };
//# sourceMappingURL=fynmesh-node-kernel.js.map
