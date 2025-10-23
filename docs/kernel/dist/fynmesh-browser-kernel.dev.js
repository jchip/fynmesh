(function () {
    'use strict';

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

    const DummyMiddlewareReg = {
        regKey: "",
    };
    /**
     * Abstract base class for FynMesh kernel implementations
     * Contains all platform-agnostic logic
     */
    class FynMeshKernelCore {
        constructor() {
            this.version = "1.0.0";
            this.shareScopeName = fynMeshShareScope;
            this.deferInvoke = [];
            this.middlewareReady = new Map();
            // Bootstrap coordination state
            this.bootstrappingApp = null;
            this.deferredBootstraps = [];
            // Track FynApp bootstrap status and provider/consumer relationships
            this.fynAppBootstrapStatus = new Map();
            this.fynAppProviderModes = new Map();
            this.events = new FynEventTarget();
            this.runTime = {
                appsLoaded: {},
                middlewares: {},
            };
            this.events.on("MIDDLEWARE_READY", (event) => {
                this.handleMiddlewareReady(event);
            });
            this.events.on("FYNAPP_BOOTSTRAPPED", (event) => {
                this.handleFynAppBootstrapped(event);
            });
        }
        /**
         * Send an event to the kernel
         * @param event - event to send
         */
        async emitAsync(event) {
            return this.events.dispatchEvent(event);
        }
        /**
         * Programmatic API for middlewares to signal readiness.
         * This mirrors MIDDLEWARE_READY event handling but avoids requiring a DOM CustomEvent.
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
        async handleMiddlewareReady(event) {
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
                    this.deferInvoke[i] = null;
                }
            }
            if (resumes.length > 0) {
                this.deferInvoke = this.deferInvoke.filter(Boolean);
                for (const resume of resumes) {
                    await this.callMiddlewares(resume.callContexts);
                }
            }
            console.debug(`✅ Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`);
        }
        /**
         * Handle FynApp bootstrap completion event
         * Resume any deferred bootstraps that have their dependencies satisfied
         */
        async handleFynAppBootstrapped(event) {
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
         * Register a middleware implementation with enhanced error handling
         */
        registerMiddleware(mwReg) {
            const { regKey, hostFynApp } = mwReg;
            console.log(`🔧 Registering middleware: ${regKey}, autoApplyScope:`, mwReg.middleware.autoApplyScope);
            const versionMap = this.runTime.middlewares[regKey] || Object.create(null);
            // Check if this exact middleware version is already registered
            if (versionMap[hostFynApp.version]) {
                console.debug(`⚠️ Middleware already registered: ${regKey}@${hostFynApp.version} - skipping duplicate registration`);
                return;
            }
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
                    const mwReg = versionMap["default"];
                    if (mwReg)
                        return mwReg;
                }
            }
            return DummyMiddlewareReg;
        }
        /**
         * Initialize the kernel runtime data
         */
        initRunTime(data) {
            this.runTime = {
                ...data,
            };
            return this.runTime;
        }
        /**
         * Clean up a container name to ensure it's a valid identifier
         */
        cleanContainerName(name) {
            return name.replace(/[\@\-./]/g, "_").replace(/^_*/, "");
        }
        async loadExposeModule(fynApp, exposeName, loadMiddlewares) {
            const container = fynApp.entry.container;
            if (!container?.$E[exposeName]) {
                console.debug(`❌ No expose module '${exposeName}' found for`, fynApp.name, fynApp.version);
                return;
            }
            if (container?.$E[exposeName]) {
                const factory = await fynApp.entry.get(exposeName);
                const exposedModule = factory();
                const mwExports = [];
                if (loadMiddlewares) {
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
                    fynApp.exposes[exposeName] = exposedModule;
                    if (exposedModule.__name) {
                        fynApp.exposes[exposedModule.__name] = exposedModule;
                    }
                    return exposedModule;
                }
            }
        }
        async loadFynAppBasics(fynAppEntry) {
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
            await this.loadExposeModule(fynApp, "./main", true);
            console.debug("✅ FynApp basics loaded for", fynApp.name, fynApp.version);
            // Record app in runtime registry for observability
            this.runTime.appsLoaded[fynApp.name] = fynApp;
            return fynApp;
        }
        createFynModuleRuntime(fynApp) {
            return {
                fynApp,
                middlewareContext: new Map(),
            };
        }
        async invokeFynModule(fynMod, fynApp) {
            const runtime = this.createFynModuleRuntime(fynApp);
            // NEW: Check for middleware execution overrides
            const executionOverride = this.findExecutionOverride(fynApp, fynMod);
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
        findExecutionOverride(fynApp, fynModule) {
            const autoApplyMiddlewares = this.runTime.autoApplyMiddlewares;
            if (!autoApplyMiddlewares)
                return null;
            // Check middleware that auto-applies to this FynApp type
            const isMiddlewareProvider = Object.keys(fynApp.exposes).some(key => key.startsWith('./middleware'));
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
        checkSingleMiddlewareReady(cc) {
            if (this.middlewareReady.has(cc.reg.fullKey)) {
                cc.runtime.share = this.middlewareReady.get(cc.reg.fullKey);
                cc.status = "ready";
                return true;
            }
            return false;
        }
        checkMiddlewareReady(ccs) {
            let status = "ready";
            for (const cc of ccs) {
                if (!this.checkSingleMiddlewareReady(cc)) {
                    status = "defer";
                }
            }
            return status;
        }
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
        async callMiddlewares(ccs, tries = 0) {
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
                    console.debug("🚀 Invoking middleware", reg.regKey, "setup for", fynApp.name, fynApp.version);
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
                const result = await fynMod.initialize(runtime);
                // Capture provider/consumer mode for dependency tracking
                if (result?.mode) {
                    // Track this FynApp's mode for each middleware it uses
                    if (!this.fynAppProviderModes.has(fynApp.name)) {
                        this.fynAppProviderModes.set(fynApp.name, new Map());
                    }
                    const modes = this.fynAppProviderModes.get(fynApp.name);
                    // Store mode for each middleware this FynApp uses
                    for (const cc of ccs) {
                        modes.set(cc.reg.middleware.name, result.mode);
                    }
                    console.debug(`📝 ${fynApp.name} registered as ${result.mode} for middleware(s)`);
                }
                status = this.checkDeferCalls(result?.status, ccs);
                if (status === "defer") {
                    return status;
                }
                if (status === "retry") {
                    return await this.callMiddlewares(ccs, tries + 1);
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
            if (fynMod.execute) {
                console.debug("🚀 Invoking user.execute for", fynApp.name, fynApp.version);
                await fynMod.execute(runtime);
            }
            return "ready";
        }
        async useMiddlewareOnFynModule(fynMod, fynApp) {
            if (!fynMod.__middlewareMeta) {
                return "";
            }
            const runtime = this.createFynModuleRuntime(fynApp);
            const ccs = fynMod.__middlewareMeta
                .map((meta) => {
                const info = meta.info;
                const reg = this.getMiddleware(info.name, info.provider);
                if (reg.regKey === "") {
                    console.debug("❌ No middleware found for", info.name, info.provider);
                    return {};
                }
                return {
                    meta,
                    fynMod,
                    fynApp,
                    reg,
                    kernel: this,
                    runtime,
                    status: "",
                };
            })
                .filter((cc) => cc.meta !== undefined);
            return this.callMiddlewares(ccs);
        }
        async applyAutoScopeMiddlewares(fynApp, fynModule) {
            console.log(`🎯 Auto-apply check for ${fynApp.name}: autoApplyMiddlewares exists?`, !!this.runTime.autoApplyMiddlewares);
            const autoApplyMiddlewares = this.runTime.autoApplyMiddlewares;
            if (!autoApplyMiddlewares) {
                console.log(`⏭️ No auto-apply middlewares registered yet for ${fynApp.name}`);
                return;
            }
            // Determine if this is a middleware provider FynApp
            const isMiddlewareProvider = Object.keys(fynApp.exposes).some(key => key.startsWith('./middleware'));
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
                    }
                    catch (error) {
                        console.error(`❌ Error in shouldApply for ${mwReg.regKey}:`, error);
                        continue;
                    }
                }
                console.debug(`🔄 Auto-applying ${mwReg.middleware.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`);
                const context = {
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
                }
                catch (error) {
                    console.error(`❌ Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}:`, error);
                }
            }
        }
        /**
         * Bootstrap a fynapp by:
         * - call main as function or invoke it as a FynModule
         * Uses event-based coordination to prevent concurrent bootstrap issues
         */
        async bootstrapFynApp(fynApp) {
            // Check if another app is currently bootstrapping OR dependencies not satisfied
            if (this.bootstrappingApp !== null || !this.areBootstrapDependenciesSatisfied(fynApp)) {
                const reason = this.bootstrappingApp !== null
                    ? `${this.bootstrappingApp} is currently bootstrapping`
                    : `waiting for provider dependencies`;
                console.debug(`⏸️ Deferring bootstrap of ${fynApp.name} (${reason})`);
                // Defer this bootstrap - wait for dependencies to be ready
                await new Promise((resolve) => {
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
                        await mainFynModule(this.createFynModuleRuntime(fynApp));
                    }
                    else if (mainFynModule.__middlewareMeta) {
                        await this.useMiddlewareOnFynModule(mainFynModule, fynApp);
                    }
                    else {
                        await this.invokeFynModule(mainFynModule, fynApp);
                    }
                }
                console.debug("✅ FynApp bootstrapped", fynApp.name, fynApp.version);
                // Emit bootstrap complete event
                await this.emitAsync(new CustomEvent("FYNAPP_BOOTSTRAPPED", {
                    detail: { name: fynApp.name, version: fynApp.version },
                }));
            }
            catch (error) {
                console.error(`❌ Bootstrap failed for ${fynApp.name}:`, error);
                // Clear bootstrap lock and resume next
                this.bootstrappingApp = null;
                if (this.deferredBootstraps.length > 0) {
                    const next = this.deferredBootstraps.shift();
                    if (next)
                        next.resolve();
                }
                throw error;
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
     * Browser-specific implementation of FynMesh kernel
     * Handles Federation.js integration and browser-specific loading
     */
    class BrowserKernel extends FynMeshKernelCore {
        /**
         * Load a remote fynapp through federation.js (browser-specific)
         */
        async loadFynApp(baseUrl, loadId) {
            const Federation = globalThis.Federation;
            if (!Federation) {
                throw new Error("Federation.js is not loaded.");
            }
            try {
                loadId = loadId || baseUrl;
                const urlPath = this.buildFynAppUrl(baseUrl);
                console.debug("🚀 Loading FynApp from", urlPath);
                const fynAppEntry = await Federation.import(urlPath);
                console.debug("🚀 FynApp entry loaded", fynAppEntry);
                const fynApp = await this.loadFynAppBasics(fynAppEntry);
                await this.bootstrapFynApp(fynApp);
            }
            catch (err) {
                console.error(`Failed to load remote fynapp from ${baseUrl}:`, err);
                throw err;
            }
        }
    }
    /**
     * Create and initialize a browser kernel instance
     */
    function createBrowserKernel() {
        const kernel = new BrowserKernel();
        // Initialize kernel runtime
        kernel.initRunTime({
            appsLoaded: {},
            middlewares: {},
        });
        return kernel;
    }

    /**
     * Global browser kernel instance attached to globalThis
     */
    globalThis.fynMeshKernel = createBrowserKernel();

})();
//# sourceMappingURL=fynmesh-browser-kernel.dev.js.map
