import { FynMeshKernelCore } from "./kernel-core";
import { captureEvent } from "./kernel-telemetry";
import type { FynApp } from "./types";

/**
 * Node.js-specific implementation of FynMesh kernel
 * Handles Node.js-specific module loading and federation
 */
export class NodeKernel extends FynMeshKernelCore {
  /**
   * Load a remote FynApp in a Node.js environment.
   *
   * Unlike the browser kernel there is no Federation runtime precondition, so
   * this method never throws: any load failure (dynamic import / basics /
   * bootstrap) is isolated and resolves to `null`. See
   * `FynMeshKernel.loadFynApp` for the full error contract.
   *
   * @returns the loaded FynApp after bootstrapping, or null on load failure
   */
  async loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null> {
    loadId = loadId || baseUrl;
    const urlPath = this.buildFynAppUrl(baseUrl);

    try {
      captureEvent(this.tel, "fynapp.load_started", { url: baseUrl });

      // Node.js-specific loading logic
      // This could use dynamic imports, require, or a Node.js federation library

      // For now, we'll use dynamic import as a starting point
      const fynAppEntry = await import(urlPath);

      // Check if already loaded - return existing instance to prevent duplicates
      const existing = this.checkAlreadyLoaded(fynAppEntry);
      if (existing) {
        return existing;
      }

      const fynApp = await this.loadFynAppBasics(fynAppEntry);
      await this.bootstrapFynApp(fynApp);
      captureEvent(this.tel, "fynapp.loaded", { app: fynApp.name, version: fynApp.version });
      return fynApp;
    } catch (err) {
      this.tel.capErr("fynapp.load_failed", { url: baseUrl }, err);
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
    apps: {},
    middlewares: {},
  });

  return kernel;
}
