import { FynMeshKernelCore } from "./kernel-core";

/**
 * Node.js-specific implementation of FynMesh kernel
 * Handles Node.js-specific module loading and federation
 */
export class NodeKernel extends FynMeshKernelCore {
  /**
   * Load a remote fynapp in Node.js environment
   */
  async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
    loadId = loadId || baseUrl;
    const urlPath = this.buildFynAppUrl(baseUrl);

    try {
      // Node.js-specific loading logic
      // This could use dynamic imports, require, or a Node.js federation library

      // For now, we'll use dynamic import as a starting point
      const fynAppEntry = await import(urlPath);

      const fynApp = await this.loadFynAppBasics(fynAppEntry);
      await this.bootstrapFynApp(fynApp);
    } catch (err) {
      console.error(`Failed to load remote fynapp from ${baseUrl} in Node.js:`, err);
      throw err;
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
