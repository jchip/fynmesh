
/*
exports: __middleware__BasicCounter,__middleware__ReactContext
facadeModuleId: /Users/jchen26/dev/fynmesh/demo/fynapp-react-middleware/src/main.ts
moduleIds: /Users/jchen26/dev/fynmesh/demo/fynapp-react-middleware/src/main.ts
dynamicImports: 
fileName: main-c47p0ikH.js
imports: react-context-CVNge9KK.js,esm-react
isEntry: false
*/
(function (Federation){
//
var System = Federation._mfBind(
  {
    n: 'main', // chunk name
    f: 'main-c47p0ikH.js', // chunk fileName
    c: 'fynapp-react-middleware', // federation container name
    s: 'fynmesh', // default scope name
    e: false, // chunk isEntry
    v: '1.0.0' // container version
  },
  // dirs from ids of modules included in the chunk
  // use these to match rvm in container to find required version
  // if this is empty, it means this chunk uses no shared module
  // %nm is token that replaced node_modules
  ["src"]
);

System.register(['./react-context-CVNge9KK.js', 'esm-react'], (function (exports) {
    'use strict';
    var ReactContextMiddleware;
    return {
        setters: [function (module) {
            ReactContextMiddleware = module.ReactContextMiddleware;
        }, null],
        execute: (function () {

            // =============================================================================
            // Export for Federation
            // =============================================================================
            /**
             * Export middleware instance for federation loading
             * The kernel will look for exports that start with __middleware__
             */
            const __middleware__ReactContext = exports("__middleware__ReactContext", new ReactContextMiddleware());
            const __middleware__BasicCounter = exports("__middleware__BasicCounter", {
                name: "basic-counter",
                async setup(cc) {
                    var _a;
                    const mwContext = cc.runtime.middlewareContext;
                    let status = "defer";
                    // get config from fynapp's useMiddleware
                    // need the middleware usage object
                    const config = cc.meta.config;
                    if (config !== "consume-only") {
                        const shareKey = `${cc.reg.fullKey}-${cc.fynApp.name}@${cc.fynApp.version}`;
                        const initialConfig = {
                            count: 0,
                            ...config,
                        };
                        const eventTarget = new EventTarget();
                        const data = mwContext.get(this.name) || {
                            initialConfig, // Store the original config for reset functionality
                            config: { ...initialConfig }, // Current working config
                            eventTarget, // Standard EventTarget for inter-app communication
                            // Methods for apps to use
                            increment(source) {
                                this.config.count++;
                                const event = new CustomEvent("counterChanged", {
                                    detail: {
                                        count: this.config.count,
                                        source: source || "unknown",
                                    },
                                });
                                this.eventTarget.dispatchEvent(event);
                                return this.config.count;
                            },
                            reset(source) {
                                this.config.count = this.initialConfig.count;
                                const event = new CustomEvent("counterChanged", {
                                    detail: {
                                        count: this.config.count,
                                        source: source || "unknown",
                                    },
                                });
                                this.eventTarget.dispatchEvent(event);
                                return this.config.count;
                            },
                            setCount(newCount, source) {
                                this.config.count = newCount;
                                const event = new CustomEvent("counterChanged", {
                                    detail: {
                                        count: this.config.count,
                                        source: source || "unknown",
                                    },
                                });
                                this.eventTarget.dispatchEvent(event);
                                return this.config.count;
                            },
                        };
                        mwContext.set(this.name, data);
                        cc.reg.hostFynApp.middlewareContext.set(shareKey, data);
                        status = "ready";
                        const event = new CustomEvent("MIDDLEWARE_READY", {
                            detail: { name: this.name, share: { shareKey }, status, cc },
                        });
                        cc.kernel.emitAsync(event);
                        console.debug(`🔍 fynapp-react-middleware: Basic counter ready event dispatched now:`, Date.now());
                    }
                    else {
                        const shareKey = (_a = cc.runtime.share) === null || _a === void 0 ? void 0 : _a.shareKey;
                        console.debug("🔍 fynapp-react-middleware: basic counter shareKey:", shareKey, cc.runtime);
                        const data = cc.reg.hostFynApp.middlewareContext.get(shareKey);
                        if (data) {
                            mwContext.set(this.name, data);
                            status = "ready";
                        }
                        console.debug(`🔍 fynapp-react-middleware: status: ${status} Basic counter setup for`, cc.fynApp.name, cc.fynApp.version, "is consume-only now:", Date.now());
                    }
                    return { status };
                },
                apply(_cc) {
                    // nothing to apply
                },
            });

        })
    };
}));

})(globalThis.Federation);
//# sourceMappingURL=main-c47p0ikH.js.map
