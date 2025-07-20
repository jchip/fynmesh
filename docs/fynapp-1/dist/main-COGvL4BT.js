
/*
exports: main
facadeModuleId: /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/main.ts
moduleIds: /Users/jchen26/dev/fynmesh/demo/fynapp-1/node_modules/@fynmesh/kernel/lib/use-middleware.js
  /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/components.ts
  /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/main.ts
dynamicImports: -MF_EXPOSE fynapp-x1/main ^2.0.0
fileName: main-COGvL4BT.js
imports: esm-react,esm-react-dom,App-D_vs7PXJ.js
isEntry: false
*/
(function (Federation){
//
var System = Federation._mfBind(
  {
    n: 'main', // chunk name
    f: 'main-COGvL4BT.js', // chunk fileName
    c: 'fynapp-1', // federation container name
    s: 'fynmesh', // default scope name
    e: false, // chunk isEntry
    v: '1.0.0' // container version
  },
  // dirs from ids of modules included in the chunk
  // use these to match rvm in container to find required version
  // if this is empty, it means this chunk uses no shared module
  // %nm is token that replaced node_modules
  ["src","%nm/@fynmesh/kernel/lib"]
);

System.register(['esm-react', 'esm-react-dom', './App-D_vs7PXJ.js'], (function (exports, module) {
    'use strict';
    var React, ReactDomClient, App;
    return {
        setters: [function (module) {
            React = module.default;
        }, function (module) {
            ReactDomClient = module.default;
        }, function (module) {
            App = module.default;
        }],
        execute: (function () {

            /**
             * mark some user code for middleware usage
             *
             * @param meta Information about the middleware
             * @param config Configuration for the middleware
             * @param user User code that uses the middleware
             * @returns A middleware usage object
             */
            const useMiddleware = (meta, user) => {
                user.__middlewareMeta = [].concat(meta);
                return user;
            };
            const noOpMiddlewareUser = {
                initialize: () => { },
                execute: () => { },
            };
            // example usage of useMiddleware
            useMiddleware({
                info: {
                    name: "react-context",
                    version: "^1.0.0",
                    provider: "fynapp-react-lib",
                },
                config: { theme: "light" },
            }, noOpMiddlewareUser);

            /**
            * This file handles dynamic imports of the reusable components from fynapp-x1
            * These imports are managed by the fynmesh kernel's module federation system
            */
            /**
             * Preloads all components from fynapp-x1 and returns them as a library
             * This should be called before rendering the App component
             */
            const preloadComponents = async () => {
                try {
                    // dynamic import exposed modules from module federation remote container
                    // @ts-ignore - TS can't understand module federation remote containers
                    const components = await Federation._importExpose('-MF_EXPOSE fynapp-x1/main ^2.0.0');
                    // Return the components library
                    return components;
                }
                catch (error) {
                    console.error('Failed to load components from fynapp-x1:', error);
                    throw error;
                }
            };

            /**
             * Standardized middleware user interface
             */
            const middlewareUser = {
                /**
                 * Tell middleware what we need - called first to determine readiness
                 */
                initialize(runtime) {
                    const basicCounterData = runtime.middlewareContext.get("basic-counter");
                    const config = basicCounterData?.config;
                    console.debug(`📋 ${runtime.fynApp.name} initialize called with config:`, config);
                    // We're a primary provider
                    return {
                        status: "ready",
                        mode: "provider",
                    };
                },
                /**
                 * Main function - called when middleware is ready
                 */
                async execute(runtime) {
                    // Create a loading indicator
                    const createLoadingIndicator = () => {
                        const loadingDiv = document.createElement("div");
                        loadingDiv.id = "fynapp-1-loading";
                        loadingDiv.style.padding = "20px";
                        loadingDiv.style.textAlign = "center";
                        loadingDiv.innerHTML = `
            <h2>Loading components from fynapp-x1...</h2>
            <div style="margin-top: 20px; display: inline-block;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3;
                            border-top: 5px solid #3498db; border-radius: 50%;
                            animation: spin 1s linear infinite;"></div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
                        return loadingDiv;
                    };
                    // Find or create the div element to render into
                    let targetDiv = document.getElementById("fynapp-1");
                    if (!targetDiv) {
                        targetDiv = document.createElement("div");
                        targetDiv.id = "fynapp-1";
                        document.body.appendChild(targetDiv);
                    }
                    // Show loading indicator
                    const loadingIndicator = createLoadingIndicator();
                    targetDiv.appendChild(loadingIndicator);
                    // Pre-load components from fynapp-x1
                    let componentLibrary;
                    try {
                        // Load the actual components
                        componentLibrary = await preloadComponents();
                        console.debug("Successfully loaded component library from fynapp-x1");
                    }
                    catch (error) {
                        console.error("Failed to load components from fynapp-x1:", error);
                        // Show error message
                        targetDiv.innerHTML = `
            <div style="padding: 20px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
                <h3>Error Loading Components</h3>
                <p>Failed to load component library from fynapp-x1. Check console for details.</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
                        return; // Exit early
                    }
                    finally {
                        // Remove loading indicator
                        if (loadingIndicator.parentNode) {
                            loadingIndicator.parentNode.removeChild(loadingIndicator);
                        }
                    }
                    // Get the basic counter middleware data to access config
                    const basicCounterData = runtime.middlewareContext.get("basic-counter");
                    const middlewareConfig = basicCounterData?.config || { count: 0 };
                    console.debug("🔍 fynapp-1: Available middleware APIs:", Array.from(runtime.middlewareContext.keys()));
                    console.debug("🔍 fynapp-1: Middleware config:", middlewareConfig);
                    // Render the React component with pre-loaded components and middleware config
                    const root = ReactDomClient.createRoot(targetDiv);
                    root.render(React.createElement(App, {
                        appName: runtime.fynApp.name,
                        components: componentLibrary,
                        middlewareConfig,
                        runtime, // Pass runtime for middleware context access
                    }));
                },
            };
            // Export the middleware usage with standardized interface
            const main = exports("main", useMiddleware([
                {
                    info: {
                        name: "basic-counter",
                        provider: "fynapp-react-middleware",
                        version: "^1.0.0",
                    },
                    config: {
                        count: 10,
                    },
                },
                {
                    info: {
                        name: "design-tokens",
                        provider: "fynapp-design-tokens",
                        version: "^1.0.0",
                    },
                    config: {
                        theme: "fynmesh-default",
                        cssCustomProperties: true,
                        cssVariablePrefix: "fynmesh",
                        enableThemeSwitching: true,
                        global: false, // Use scoped themes per fynapp
                    },
                },
            ], middlewareUser));

        })
    };
}));

})(globalThis.Federation);
//# sourceMappingURL=main-COGvL4BT.js.map
