import { FynMeshKernelCore } from "./kernel-core";
import type { FynApp, PreloadStrategy, LoadFynAppsOptions } from "./types";
import { PreloadPriority } from "./types";

/**
 * Browser-specific implementation of FynMesh kernel
 * Handles Federation.js integration and browser-specific loading
 */
export class BrowserKernel extends FynMeshKernelCore {
  private preloadStrategy: Required<PreloadStrategy> = {
    depth: 1, // Default: requested + immediate dependencies
    priority: 'static',
    priorityByDepth: {
      0: PreloadPriority.CRITICAL,
      1: PreloadPriority.IMPORTANT,
      2: PreloadPriority.DEFERRED
    },
    disabled: false
  };

  /**
   * Resolve preload strategy from options
   */
  private resolvePreloadStrategy(options?: LoadFynAppsOptions): Required<PreloadStrategy> {
    if (!options?.preload) {
      return this.preloadStrategy; // Use instance default
    }

    // Shorthand: number = depth
    if (typeof options.preload === 'number') {
      return {
        ...this.preloadStrategy,
        depth: options.preload
      };
    }

    // Full strategy object
    return {
      depth: options.preload.depth ?? this.preloadStrategy.depth,
      priority: options.preload.priority ?? this.preloadStrategy.priority,
      priorityByDepth: options.preload.priorityByDepth ?? this.preloadStrategy.priorityByDepth,
      disabled: options.preload.disabled ?? this.preloadStrategy.disabled
    };
  }

  /**
   * Inject a modulepreload link tag into the document head
   * @private
   */
  private injectPreloadLink(url: string): void {
    // Skip if document/head not available
    if (typeof document === "undefined" || !document.head) {
      return;
    }

    // Create modulepreload link tag
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = url;
    link.as = "script";

    // Append to head
    document.head.appendChild(link);
  }

  /**
   * Override loadFynAppsByName to handle preload strategy
   */
  async loadFynAppsByName(
    requests: Array<{ name: string; range?: string }>,
    options?: LoadFynAppsOptions
  ): Promise<void> {
    // Resolve and store strategy for this load
    const strategy = this.resolvePreloadStrategy(options);

    // Store strategy temporarily for preload callback
    const previousStrategy = this.preloadStrategy;
    this.preloadStrategy = strategy;

    try {
      // Call parent implementation
      await super.loadFynAppsByName(requests, options);
    } finally {
      // Restore previous strategy
      this.preloadStrategy = previousStrategy;
    }
  }

  /**
   * Load a remote fynapp through federation.js (browser-specific)
   * Returns the loaded FynApp after bootstrapping
   */
  async loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null> {
    const Federation = (globalThis as any).Federation;
    if (!Federation) {
      throw new Error("Federation.js is not loaded.");
    }

    try {
      loadId = loadId || baseUrl;
      const urlPath = this.buildFynAppUrl(baseUrl);
      console.debug("🚀 Loading FynApp from", urlPath);
      const fynAppEntry = await Federation.import(urlPath);

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
      console.error(`Failed to load FynApp from ${baseUrl}:`, err);
      return null;
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

  // Set up preload callback to inject modulepreload link tags with depth filtering
  kernel.setPreloadCallback((url: string, depth: number) => {
    const strategy = kernel["preloadStrategy"];

    // Check if preloading is disabled
    if (strategy.disabled) {
      console.debug(`⏭️  Preload disabled, skipping: ${url} (depth: ${depth})`);
      return;
    }

    // Check if depth exceeds max depth
    if (depth > strategy.depth) {
      console.debug(`⏭️  Depth ${depth} > max ${strategy.depth}, skipping: ${url}`);
      return;
    }

    // Inject the preload link
    kernel["injectPreloadLink"](url);
  });

  return kernel;
}
