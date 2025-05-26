import { FynMeshKernelCore } from "./kernel-core";
import type { FynAppInfo } from "./types";

/**
 * Browser-specific implementation of FynMesh kernel
 * Handles Federation.js integration and browser-specific loading
 */
export class BrowserKernel extends FynMeshKernelCore {
    /**
     * Load a remote fynapp through federation.js (browser-specific)
     */
    async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
        loadId = loadId || baseUrl;
        const urlPath = this.buildFynAppUrl(baseUrl);

        try {
            const Federation = (globalThis as any).Federation;
            if (!Federation) {
                throw new Error("Federation.js is not loaded.");
            }

            const fynAppEntry = await Federation.import(urlPath);

            // Create app info and bootstrap directly
            const appInfo: FynAppInfo = {
                name: fynAppEntry.container.name,
                version: fynAppEntry.container.version || "1.0.0",
                packageName: fynAppEntry.container.name,
                entry: fynAppEntry,
            };

            await this.bootstrapFynApp([appInfo]);
        } catch (err) {
            console.error(`Failed to load remote fynapp from ${baseUrl}:`, err);
            throw err;
        }
    }
}

/**
 * Create and initialize a browser kernel instance
 */
export function createBrowserKernel(): BrowserKernel {
    const kernel = new BrowserKernel();

    // Initialize kernel runtime
    kernel.initRunTime({
        appsLoaded: {},
        middlewares: {}
    });

    return kernel;
}

/**
 * Global browser kernel instance
 */
export const browserKernel = createBrowserKernel();

// Attach to globalThis for browser access
(globalThis as any).fynMeshKernel = browserKernel;
