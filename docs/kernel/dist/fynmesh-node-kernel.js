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
        this.events = new FynEventTarget();
        this.runTime = {
            appsLoaded: {},
            middlewares: {},
        };
        this.events.on("MIDDLEWARE_READY", (event) => {
            this.handleMiddlewareReady(event);
        });
    }
    /**
     * Send an event to the kernel
     * @param event - event to send
     */
    async emitAsync(event) {
        return this.events.dispatchEvent(event);
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
     * Register a middleware implementation with enhanced error handling
     */
    registerMiddleware(mwReg) {
        const { regKey, hostFynApp } = mwReg;
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
        console.debug(`✅ Registered middleware: ${regKey}@${hostFynApp.version}`);
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
            else {
                console.debug(`❌ No expose module '${exposeName}' found for`, fynApp.name, fynApp.version);
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
        if (fynMod.initialize) {
            console.debug("🚀 Invoking module.initialize for", fynApp.name, fynApp.version);
            await fynMod.initialize(runtime);
        }
        if (fynMod.execute) {
            console.debug("🚀 Invoking module.execute for", fynApp.name, fynApp.version);
            await fynMod.execute(runtime);
        }
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
            this.deferInvoke.push({
                callContexts: ccs,
            });
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
    /**
     * Bootstrap a fynapp by:
     * - call main as function or invoke it as a FynModule
     */
    async bootstrapFynApp(fynApp) {
        if (fynApp.entry.config?.loadMiddlewares) {
            for (const exposeName of Object.keys(fynApp.entry.container.$E)) {
                if (exposeName.startsWith("./middleware")) {
                    await this.loadExposeModule(fynApp, exposeName, true);
                }
            }
        }
        const mainFynModule = fynApp.exposes["./main"]?.main;
        if (mainFynModule) {
            console.debug("🚀 Bootstrapping FynApp", fynApp.name, fynApp.version);
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
