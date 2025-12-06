import { FynMeshKernelCore } from "./kernel-core";
import type { FynApp } from "./types";

/**
 * Node.js-specific implementation of FynMesh kernel
 * Handles Node.js-specific module loading and federation
 */
export class NodeKernel extends FynMeshKernelCore {
  /**
   * Load a remote fynapp in Node.js environment
   * Returns the loaded FynApp after bootstrapping
   */
  async loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null> {
    loadId = loadId || baseUrl;
    const urlPath = this.buildFynAppUrl(baseUrl);

    try {
      // Node.js-specific loading logic
      // This could use dynamic imports, require, or a Node.js federation library

      // For now, we'll use dynamic import as a starting point
      const fynAppEntry = await import(urlPath);

      // Check if already loaded - return existing instance to prevent duplicates
      const fynAppName = fynAppEntry.container?.name;
      if (fynAppName && this.runTime.appsLoaded[fynAppName]) {
        console.debug(`✅ FynApp ${fynAppName} already loaded, returning existing instance`);
        return this.runTime.appsLoaded[fynAppName];
      }

      const fynApp = await this.loadFynAppBasics(fynAppEntry);
      await this.bootstrapFynApp(fynApp);
      return fynApp;
    } catch (err) {
      console.error(`Failed to load FynApp from ${baseUrl} in Node.js:`, err);
      return null;
    }
  }
}

/**
 * Create and initialize a Node.js kernel instance
 */
export function createNodeKernel(): NodeKernel {
  const kernel = new NodeKernel();

  // Initialize kernel runtime
  kernel.initRunTime({
    appsLoaded: {},
    middlewares: {},
  });

  return kernel;
}
