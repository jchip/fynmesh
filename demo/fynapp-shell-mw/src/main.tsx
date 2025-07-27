import type { FynModule, FynModuleRuntime } from '@fynmesh/kernel';

// FynModule implementation for the shell FynApp
const shellFynModule: FynModule = {
    async execute(runtime: FynModuleRuntime) {
        console.log("🏠 Shell FynApp main module executing!");
        console.log("🏠 Runtime object:", {
            hasKernel: !!runtime.kernel,
            hasMiddlewareContext: !!runtime.middlewareContext,
            middlewareContextSize: runtime.middlewareContext?.size || 0
        });

        // Get shell middleware context (it auto-applies to this FynApp)
        const shellMiddleware = runtime.middlewareContext.get("shell-layout");

        if (shellMiddleware) {
            console.log("✅ Shell middleware available - shell UI will be initialized by middleware");
            console.log("🔗 Available middleware APIs:", Object.keys(shellMiddleware));

            // The middleware handles all UI initialization and coordination
            // The shell FynApp just needs to exist to trigger the middleware application
        } else {
            console.warn("⚠️ Shell middleware not found in context");
        }

        console.log("🏠 Shell FynApp ready - middleware handles everything");
    }
};

export const main = shellFynModule;
