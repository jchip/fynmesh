import { FynMeshKernelCore } from "./kernel-core";
/**
 * Browser-specific implementation of FynMesh kernel
 * Handles Federation.js integration and browser-specific loading
 */
export declare class BrowserKernel extends FynMeshKernelCore {
    /**
     * Load a remote fynapp through federation.js (browser-specific)
     */
    loadFynApp(baseUrl: string, loadId?: string): Promise<void>;
}
/**
 * Create and initialize a browser kernel instance
 */
export declare function createBrowserKernel(): BrowserKernel;
