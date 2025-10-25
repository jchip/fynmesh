import { FynMeshKernelCore } from "./kernel-core";

/**
 * Browser-specific implementation of FynMesh kernel
 * Handles Federation.js integration and browser-specific loading
 */
export class BrowserKernel extends FynMeshKernelCore {
  /**
   * Load a remote fynapp through federation.js (browser-specific)
   */
  async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
    const Federation = (globalThis as any).Federation;
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
    middlewares: {},
  });

  // Demo-server resolver: manifest at /<name>/dist/fynapp.manifest.json and base at /<name>/dist/
  kernel.setRegistryResolver(async (name: string, range?: string) => {
    return {
      name,
      version: "0.0.0", // version not critical for demo resolver; keying by name is fine
      manifestUrl: `/${name}/dist/fynapp.manifest.json`,
      distBase: `/${name}/dist/`,
    };
  });

  return kernel;
}
