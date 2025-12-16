import type {
  FynAppMiddleware,
  FynAppMiddlewareCallContext,
  FynApp,
  FynUnit,
} from "@fynmesh/kernel";

/**
 * Shell execution result types - middleware-defined contracts
 * These types are specific to the shell middleware and define
 * what FynUnits can return when rendered by the shell.
 */
export interface ShellExecutionResultBase {
  type: string;
  metadata?: {
    framework?: string;
    version?: string;
    capabilities?: string[];
  };
}

/**
 * Return a component factory - shell will call it with React to get the component
 */
export interface ComponentFactoryResult extends ShellExecutionResultBase {
  type: 'component-factory';
  componentFactory: (React: any) => {
    component: any;
    props?: Record<string, any>;
  };
}

/**
 * Return pre-rendered HTML content
 */
export interface RenderedContentResult extends ShellExecutionResultBase {
  type: 'rendered-content';
  content: HTMLElement | string;
}

/**
 * FynApp will manage its own rendering into the provided container
 */
export interface SelfManagedResult extends ShellExecutionResultBase {
  type: 'self-managed';
  target: HTMLElement;
  cleanup?: () => void;
}

/**
 * FynApp has nothing to render (e.g., utility/service FynApp)
 */
export interface NoRenderResult extends ShellExecutionResultBase {
  type: 'no-render';
  message?: string;
}

/**
 * Return a React component directly with its React and ReactDOM dependencies
 */
export interface ReactComponentResult extends ShellExecutionResultBase {
  type: 'react-component';
  component: any;
  props?: Record<string, any>;
  react?: any;
  reactDOM?: any;
}

/**
 * Return a render function that will be called with the container
 */
export interface RenderFunctionResult extends ShellExecutionResultBase {
  type: 'render-function';
  render: (container: HTMLElement) => void | Promise<void>;
  cleanup?: () => void;
}

/**
 * Union type for all shell-supported execution results
 */
export type ShellExecutionResult =
  | ComponentFactoryResult
  | RenderedContentResult
  | SelfManagedResult
  | NoRenderResult
  | ReactComponentResult
  | RenderFunctionResult;

// Region types for layout
type RegionName = 'sidebar' | 'main';

interface RegionInfo {
  container: HTMLElement | null;
  fynAppId: string | null;
  fynApp: FynApp | null;
}

export class ShellLayoutMiddleware implements FynAppMiddleware {
  public readonly name = "shell-layout";

  // Auto-apply to both regular FynApps and middleware providers (including itself)
  public readonly autoApplyScope = ["fynapp", "middleware"] as ("all" | "fynapp" | "middleware")[];

  private loadedFynApps = new Map<string, FynApp>();
  private shellRuntime: any = null;
  private kernel: any = null; // Store kernel reference for dynamic loading
  private fynappContainers = new Map<string, HTMLElement>(); // Store container elements for each FynApp
  private selfManagedApps = new Map<string, SelfManagedResult>(); // Track self-managed FynApps
  private reactRoots = new Map<string, any>(); // Track React roots for each FynApp to avoid double-mounting

  // Multi-region layout support
  private regions = new Map<RegionName, RegionInfo>([
    ['sidebar', { container: null, fynAppId: null, fynApp: null }],
    ['main', { container: null, fynAppId: null, fynApp: null }],
  ]);
  private selectedRegion: RegionName = 'main'; // Default region for loading
  private pendingRegionLoad = new Map<string, RegionName>(); // Track which region a FynApp is being loaded into

  // Per-region tracking of all loaded FynApps (for visibility toggle pattern)
  // Map<RegionName, Map<fynAppName, { container: HTMLElement, fynApp: FynApp }>>
  private regionFynApps = new Map<RegionName, Map<string, { container: HTMLElement; fynApp: FynApp }>>([
    ['sidebar', new Map()],
    ['main', new Map()],
  ]);

  // Available FynApps for dynamic loading - exposed via getAvailableApps()
  private availableFynApps = [
    { id: "fynapp-1", name: "FynApp 1 (React 19)", url: "/fynapp-1/dist", framework: "React 19" },
    { id: "fynapp-1-b", name: "FynApp 1-B (React 19)", url: "/fynapp-1-b/dist", framework: "React 19" },
    { id: "fynapp-2-react18", name: "FynApp 2 (React 18)", url: "/fynapp-2-react18/dist", framework: "React 18" },
    { id: "fynapp-6-react", name: "FynApp 6 (React)", url: "/fynapp-6-react/dist", framework: "React" },
    { id: "fynapp-ag-grid", name: "AG Grid (React 19)", url: "/fynapp-ag-grid/dist", framework: "React 19" },
    { id: "fynapp-4-vue", name: "FynApp 4 (Vue)", url: "/fynapp-4-vue/dist", framework: "Vue" },
    { id: "fynapp-5-preact", name: "FynApp 5 (Preact)", url: "/fynapp-5-preact/dist", framework: "Preact" },
    { id: "fynapp-7-solid", name: "FynApp 7 (Solid)", url: "/fynapp-7-solid/dist", framework: "Solid" },
    { id: "fynapp-3-marko", name: "FynApp 3 (Marko)", url: "/fynapp-3-marko/dist", framework: "Marko" },
  ];

  async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
    console.log("🏠 Shell Layout middleware setup started");
    console.log("🏠 Setup context:", { fynAppName: context.fynApp.name });

    // Store kernel reference for dynamic loading
    this.kernel = context.kernel;

    return { status: "ready" };
  }

  async apply(context: FynAppMiddlewareCallContext): Promise<void> {
    const { fynApp, runtime } = context;

    console.log(`🏠 Applying Shell Layout middleware to ${fynApp.name}`);
    console.log("🏠 Apply context:", { fynAppName: fynApp.name, isShellApp: fynApp.name === 'fynapp-shell-mw' });

    // If this is the shell FynApp itself, store its runtime and initialize shell UI
    if (fynApp.name === 'fynapp-shell-mw') {
      this.shellRuntime = runtime;
      this.initializeShellUI();
    }

    // Provide shell coordination API to all FynApps
    runtime.middlewareContext.set(this.name, {
      // Simple API for sidebar/navigation components
      loadApp: this.loadApp.bind(this), // Fire-and-forget, loads into main region
      getAvailableApps: () => [...this.availableFynApps], // Returns list of available FynApps
      getLoadedApps: () => Array.from(this.loadedFynApps.keys()),

      // Legacy/internal APIs
      loadFynApp: this.loadFynApp.bind(this),
      unloadFynApp: this.unloadFynApp.bind(this),
      getLoadedFynApps: () => Array.from(this.loadedFynApps.keys()),
      renderIntoShell: this.renderIntoShell.bind(this),
      isShellAvailable: () => !!this.regions.get('main')?.container,
      initializeShell: this.initializeShellUI.bind(this),
      clearContent: this.clearContent.bind(this),
      // Region APIs (for advanced use cases)
      loadIntoRegion: this.loadIntoRegion.bind(this),
      clearRegion: this.clearRegion.bind(this),
      getRegions: () => Array.from(this.regions.keys()),
      getRegionContent: (region: RegionName) => this.regions.get(region)?.fynAppId || null,
    });

    // If this is a dynamically loaded FynApp (not the shell itself), manage its layout
    if (fynApp.name !== 'fynapp-shell-mw') {
      await this.manageAppLayout(fynApp);
    }
  }

  private initializeShellUI(): void {
    console.log("🏠 Starting shell UI initialization");
    const shellRoot = document.getElementById('shell-root');
    if (!shellRoot) {
      console.error("❌ Shell root element not found");
      return;
    }
    console.log("🏠 Found shell-root element, creating UI...");

    // Create shell layout structure with sidebar + main regions
    // Note: availableFynApps is now a class property exposed via getAvailableApps()
    shellRoot.innerHTML = `
      <style>
        .shell-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          grid-template-rows: auto auto 1fr auto;
          grid-template-areas:
            "header header"
            "nav nav"
            "sidebar main"
            "footer footer";
          height: 100vh;
          background: #f3f4f6;
        }
        .shell-footer {
          grid-area: footer;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          color: white;
          padding: 0.5rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;
        }
        .shell-footer-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .shell-footer-right {
          display: flex;
          align-items: center;
          gap: 1rem;
          opacity: 0.9;
        }
        .status-indicator {
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
        }
        .status-dot.loading {
          background: #fbbf24;
          animation: pulse 1s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .shell-header {
          grid-area: header;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          color: white;
          padding: 1rem 1.5rem;
        }
        .shell-nav {
          grid-area: nav;
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          padding: 0.75rem 1.5rem;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .shell-sidebar {
          grid-area: sidebar;
          background: #ffffff;
          border-right: 1px solid #e5e7eb;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .shell-sidebar-content {
          flex: 1;
          overflow-y: auto;
        }
        .shell-main {
          grid-area: main;
          overflow: hidden;
          background: #ffffff;
        }
        .region-content {
          height: 100%;
          background: #ffffff;
          display: flex;
          flex-direction: column;
        }
        .region-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          color: #9ca3af;
          text-align: center;
          padding: 2rem;
        }
        .btn-load {
          padding: 0.375rem 0.75rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
        }
        .btn-load:hover { background: #1d4ed8; }
        .btn-load:disabled { background: #9ca3af; cursor: not-allowed; }
        .btn-clear {
          padding: 0.25rem 0.5rem;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .btn-clear:hover { background: #b91c1c; }
        .region-select {
          padding: 0.25rem 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.875rem;
        }
        .fynapp-selector {
          padding: 0.25rem 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          min-width: 180px;
        }
        .loading-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid #ffffff;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fynapp-container {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }
        .fynapp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          flex-shrink: 0;
        }
        .fynapp-render-target {
          flex: 1;
          overflow: auto;
        }
      </style>
      <div class="shell-layout">
        <!-- Header -->
        <div class="shell-header">
          <h1 style="margin: 0; font-size: 1.5rem;">🏠 FynMesh Shell Demo</h1>
          <p style="margin: 0.5rem 0 0 0; opacity: 0.9; font-size: 0.875rem;">
            Multi-Region Layout with Dynamic FynApp Loading
          </p>
        </div>

        <!-- Navigation -->
        <div class="shell-nav">
          <label style="font-weight: 500;">Load FynApp:</label>
          <select id="fynapp-selector" class="fynapp-selector">
            <option value="">Select a FynApp...</option>
            ${this.availableFynApps.map(app =>
      `<option value="${app.url}" data-id="${app.id}">${app.name}</option>`
    ).join('')}
          </select>
          <label style="margin-left: 0.5rem;">into:</label>
          <select id="region-selector" class="region-select">
            <option value="main" selected>Main</option>
            <option value="sidebar">Sidebar</option>
          </select>
          <button id="load-btn" class="btn-load" disabled>
            <span id="load-btn-text">Load</span>
            <span id="load-btn-spinner" class="loading-indicator" style="display: none; margin-left: 0.5rem;"></span>
          </button>
          <button id="clear-all-btn" class="btn-load" style="background: #dc2626;">
            Clear All
          </button>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 1rem;">
            <span style="font-size: 0.875rem; color: #6b7280;">
              Loaded: <span id="loaded-count">0</span> FynApps
            </span>
          </div>
        </div>

        <!-- Sidebar Region -->
        <div class="shell-sidebar">
          <div id="region-sidebar" class="shell-sidebar-content">
            <div class="region-empty">
              <p>No FynApp loaded</p>
              <p style="font-size: 0.75rem;">Select a FynApp and choose "Sidebar" to load here</p>
            </div>
          </div>
        </div>

        <!-- Main Region -->
        <div class="shell-main">
          <div id="region-main" class="region-content">
            <div class="region-empty">
              <h2 style="color: #374151;">Welcome to FynMesh Shell Demo! 🚀</h2>
              <p>Select a FynApp from the dropdown above to load it into Main or Sidebar region.</p>
              <p style="font-size: 0.875rem;">This demonstrates multi-region layout with dynamic FynApp composition.</p>
            </div>
          </div>
        </div>

        <!-- Footer Status Bar -->
        <div class="shell-footer">
          <div class="shell-footer-left">
            <div class="status-indicator">
              <span class="status-dot" id="status-dot"></span>
              <span id="status-text">Ready</span>
            </div>
            <span id="active-fynapp">No active FynApp</span>
          </div>
          <div class="shell-footer-right">
            <span>FynMesh Kernel v1.0.0</span>
            <span>|</span>
            <span id="middleware-count">0 middlewares</span>
          </div>
        </div>
      </div>
    `;

    // Store references to region containers
    const sidebarRegion = this.regions.get('sidebar')!;
    const mainRegion = this.regions.get('main')!;
    sidebarRegion.container = document.getElementById('region-sidebar');
    mainRegion.container = document.getElementById('region-main');

    // Set up event listeners
    this.setupEventListeners();

    console.log("✅ Shell UI initialized with multi-region layout");

    // Auto-load the sidebar FynApp into the sidebar region
    this.autoLoadSidebar();
  }

  private autoLoadSidebar(): void {
    // Load sidebar after a short delay to ensure kernel is ready
    setTimeout(() => {
      if (this.kernel) {
        console.log("📎 Auto-loading fynapp-sidebar into sidebar region");
        this.loadIntoRegion('/fynapp-sidebar/dist', 'sidebar').catch(err => {
          console.warn("Failed to auto-load sidebar:", err.message);
        });
      }
    }, 100);
  }

  private setupEventListeners(): void {
    const selector = document.getElementById('fynapp-selector') as HTMLSelectElement;
    const regionSelector = document.getElementById('region-selector') as HTMLSelectElement;
    const loadBtn = document.getElementById('load-btn') as HTMLButtonElement;
    const clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;

    if (selector) {
      selector.addEventListener('change', () => {
        if (loadBtn) loadBtn.disabled = !selector.value;
      });
    }

    if (regionSelector) {
      regionSelector.addEventListener('change', () => {
        this.selectedRegion = regionSelector.value as RegionName;
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener('click', async () => {
        if (!selector.value) return;

        const selectedOption = selector.selectedOptions[0];
        const fynappId = selectedOption.dataset.id;
        const fynappUrl = selector.value;

        if (fynappId) {
          await this.handleLoadFynApp(fynappId, fynappUrl, this.selectedRegion);
        }
      });
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        this.clearContent();
      });
    }
  }

  private async handleLoadFynApp(fynappId: string, fynappUrl: string, region: RegionName = 'main'): Promise<void> {
    const loadBtn = document.getElementById('load-btn') as HTMLButtonElement;
    const loadBtnText = document.getElementById('load-btn-text');
    const loadBtnSpinner = document.getElementById('load-btn-spinner');

    try {
      // Show loading state
      if (loadBtn) loadBtn.disabled = true;
      if (loadBtnText) loadBtnText.textContent = 'Loading...';
      if (loadBtnSpinner) loadBtnSpinner.style.display = 'inline-block';

      console.log(`🔄 Loading FynApp: ${fynappId} from ${fynappUrl} into region: ${region}`);

      // Use the new loadIntoRegion method
      const fynApp = await this.loadIntoRegion(fynappUrl, region);

      if (fynApp) {
        console.log(`✅ Successfully loaded FynApp: ${fynappId} into ${region}`);
      }

    } catch (error) {
      console.error(`❌ Failed to load FynApp ${fynappId}:`, (error as Error).message);
      // Show error in the target region
      const regionInfo = this.regions.get(region);
      if (regionInfo?.container) {
        regionInfo.container.innerHTML = `
          <div class="error-message" style="color: #dc2626; padding: 1rem; border: 1px solid #fecaca; border-radius: 4px; background: #fef2f2;">
            <h3>Failed to load ${fynappId}</h3>
            <p>Error: ${(error as Error).message}</p>
          </div>
        `;
      }
    } finally {
      // Reset loading state
      if (loadBtn) loadBtn.disabled = false;
      if (loadBtnText) loadBtnText.textContent = 'Load';
      if (loadBtnSpinner) loadBtnSpinner.style.display = 'none';
    }
  }

  private clearContent(): void {
    // Clear all regions (this also clears regionFynApps for each region)
    this.clearRegion('main');
    this.clearRegion('sidebar');
    // Note: loadedFynApps and fynappContainers are cleaned up by cleanupFynApp in clearRegion
    this.updateLoadedCount();
    console.log("🧹 All content cleared");
  }

  private clearRegion(region: RegionName): void {
    const regionInfo = this.regions.get(region);
    if (!regionInfo?.container) return;

    const regionApps = this.regionFynApps.get(region)!;

    // Clean up ALL FynApps in this region (not just the current one)
    for (const [appName, entry] of regionApps) {
      this.cleanupFynApp(appName, entry.fynApp);
      entry.container.remove();
    }

    // Clear the region tracking
    regionApps.clear();

    // Reset region state
    regionInfo.fynAppId = null;
    regionInfo.fynApp = null;

    // Show empty state
    if (region === 'main') {
      regionInfo.container.innerHTML = `
        <div class="region-empty">
          <h2 style="color: #374151;">Welcome to FynMesh Shell Demo! 🚀</h2>
          <p>Select a FynApp from the dropdown above to load it into Main or Sidebar region.</p>
          <p style="font-size: 0.875rem;">This demonstrates multi-region layout with dynamic FynApp composition.</p>
        </div>
      `;
    } else {
      regionInfo.container.innerHTML = `
        <div class="region-empty">
          <p>No FynApp loaded</p>
          <p style="font-size: 0.75rem;">Select a FynApp and choose "Sidebar" to load here</p>
        </div>
      `;
    }

    this.updateLoadedCount();
    console.log(`🧹 Region ${region} cleared (${regionApps.size} FynApps destroyed)`);
  }

  /**
   * Unload a specific FynApp from a region without clearing the entire region.
   * If it's the currently visible FynApp, show the most recently loaded one or empty state.
   */
  private unloadFynAppFromRegion(fynAppName: string, region: RegionName): void {
    const regionInfo = this.regions.get(region);
    if (!regionInfo?.container) return;

    const regionApps = this.regionFynApps.get(region)!;
    const entry = regionApps.get(fynAppName);
    if (!entry) {
      console.warn(`FynApp ${fynAppName} not found in region ${region}`);
      return;
    }

    // Clean up the FynApp
    this.cleanupFynApp(fynAppName, entry.fynApp);
    entry.container.remove();
    regionApps.delete(fynAppName);

    // If this was the currently visible FynApp, show another one or empty state
    if (regionInfo.fynAppId === fynAppName) {
      // Find another FynApp to show (the most recently added one)
      const remaining = Array.from(regionApps.entries());
      if (remaining.length > 0) {
        const [lastAppName, lastEntry] = remaining[remaining.length - 1];
        lastEntry.container.style.display = '';
        regionInfo.fynAppId = lastAppName;
        regionInfo.fynApp = lastEntry.fynApp;
        console.log(`🔀 Switched to ${lastAppName} after unloading ${fynAppName}`);
      } else {
        // No more FynApps in region - show empty state
        regionInfo.fynAppId = null;
        regionInfo.fynApp = null;
        if (region === 'main') {
          regionInfo.container.innerHTML = `
            <div class="region-empty">
              <h2 style="color: #374151;">Welcome to FynMesh Shell Demo! 🚀</h2>
              <p>Select a FynApp from the dropdown above to load it into Main or Sidebar region.</p>
              <p style="font-size: 0.875rem;">This demonstrates multi-region layout with dynamic FynApp composition.</p>
            </div>
          `;
        } else {
          regionInfo.container.innerHTML = `
            <div class="region-empty">
              <p>No FynApp loaded</p>
              <p style="font-size: 0.75rem;">Select a FynApp and choose "Sidebar" to load here</p>
            </div>
          `;
        }
      }
    }

    this.updateLoadedCount();
    console.log(`🗑️ Unloaded ${fynAppName} from ${region}`);
  }

  /**
   * Clean up a FynApp's resources (shutdown, React roots, tracking maps)
   */
  private cleanupFynApp(fynAppName: string, fynApp: FynApp): void {
    // Call shutdown on the FynApp's FynUnit if it has one
    const mainExport = fynApp.exposes?.["./main"]?.main;
    if (mainExport?.shutdown) {
      try {
        console.debug(`🔄 Calling shutdown for ${fynAppName}`);
        mainExport.shutdown();
      } catch (error) {
        console.warn(`Failed to shutdown FynUnit for ${fynAppName}:`, error);
      }
    }

    // Unmount React root if tracked by shell
    const root = this.reactRoots.get(fynAppName);
    if (root?.unmount) {
      try {
        root.unmount();
      } catch (error) {
        console.warn(`Failed to unmount React root for ${fynAppName}:`, error);
      }
    }

    // Clean up tracking maps
    this.loadedFynApps.delete(fynAppName);
    this.fynappContainers.delete(fynAppName);
    this.reactRoots.delete(fynAppName);
    this.selfManagedApps.delete(fynAppName);
  }

  /**
   * Simple fire-and-forget API for loading a FynApp into the main region.
   * Used by sidebar/navigation components that don't need to know about regions.
   */
  private loadApp(fynappUrl: string): void {
    console.log(`📱 loadApp called for ${fynappUrl}`);
    // Fire and forget - load into main region
    this.loadIntoRegion(fynappUrl, 'main').catch(err => {
      console.error(`❌ Failed to load app ${fynappUrl}:`, err);
    });
  }

  private async loadIntoRegion(fynappUrl: string, region: RegionName): Promise<FynApp | null> {
    if (!this.kernel) {
      console.error("❌ Kernel not available for dynamic loading");
      return null;
    }

    const regionInfo = this.regions.get(region);
    if (!regionInfo?.container) {
      console.error(`❌ Region ${region} container not found`);
      return null;
    }

    try {
      console.log(`🔄 Loading FynApp from ${fynappUrl} into region: ${region}`);

      // Extract FynApp ID from URL for pending tracking
      const fynAppIdMatch = fynappUrl.match(/\/([^\/]+)\/dist\/?$/);
      const fynAppId = fynAppIdMatch ? fynAppIdMatch[1] : fynappUrl;
      if (fynAppIdMatch) {
        // Register the target region BEFORE loading so manageAppLayout knows where to render
        this.pendingRegionLoad.set(fynAppIdMatch[1], region);
      }

      // Update footer status to loading
      this.updateFooterStatus(fynAppId);

      // Load the FynApp via kernel
      console.log(`🔄 Calling kernel.loadFynApp for ${fynappUrl}...`);
      let fynApp: FynApp | null = null;
      try {
        fynApp = await this.kernel.loadFynApp(fynappUrl);
        console.log(`🔄 kernel.loadFynApp returned:`, fynApp ? fynApp.name : 'null');
      } catch (loadError) {
        console.error(`❌ kernel.loadFynApp threw an error:`, loadError);
        throw loadError;
      }

      if (fynApp) {
        // Check if manageAppLayout was already called via auto-apply middleware
        // If the region info still shows no fynApp, we need to manage it manually
        const currentRegionInfo = this.regions.get(region);
        console.log(`🔍 Region ${region} current state:`, {
          fynApp: currentRegionInfo?.fynApp?.name,
          fynAppId: currentRegionInfo?.fynAppId,
          loadedFynAppName: fynApp.name
        });

        if (!currentRegionInfo?.fynApp || currentRegionInfo.fynAppId !== fynApp.name) {
          console.log(`🔧 Manually managing layout for ${fynApp.name} (auto-apply didn't run)`);
          // Clear the pending load first
          this.pendingRegionLoad.delete(fynApp.name);
          // Re-add it for manageAppLayout to pick up
          this.pendingRegionLoad.set(fynApp.name, region);
          await this.manageAppLayout(fynApp);
        } else {
          console.log(`✓ Layout already managed for ${fynApp.name} via auto-apply`);
          // Clear pending if still set (in case manageAppLayout didn't run)
          this.pendingRegionLoad.delete(fynApp.name);
        }
        console.log(`✅ Successfully loaded ${fynApp.name} into ${region}`);
        return fynApp;
      } else {
        console.warn(`⚠️ kernel.loadFynApp returned null for ${fynappUrl}`);
      }

      return null;
    } catch (error) {
      console.error(`❌ Failed to load FynApp from ${fynappUrl}:`, (error as Error).message);
      throw error;
    }
  }

  private async renderFynAppIntoRegion(fynApp: FynApp, region: RegionName): Promise<void> {
    const regionInfo = this.regions.get(region);
    if (!regionInfo?.container) return;

    const regionApps = this.regionFynApps.get(region)!;

    // Check if this FynApp is already loaded in this region (visibility toggle case)
    const existingEntry = regionApps.get(fynApp.name);
    if (existingEntry) {
      console.log(`👁️ FynApp ${fynApp.name} already loaded in ${region}, toggling visibility`);

      // Hide all other FynApps in this region
      for (const [appName, entry] of regionApps) {
        if (appName !== fynApp.name) {
          entry.container.style.display = 'none';
        }
      }

      // Show this FynApp
      existingEntry.container.style.display = '';

      // Update current region tracking
      regionInfo.fynAppId = fynApp.name;
      regionInfo.fynApp = fynApp;

      this.updateFooterStatus();
      console.log(`✅ Switched to ${fynApp.name} in ${region} (preserved state)`);
      return;
    }

    // NEW FynApp being loaded - hide current FynApps in region (don't destroy)
    for (const [, entry] of regionApps) {
      entry.container.style.display = 'none';
    }

    // Clear the welcome/empty message if it exists (first load case)
    const emptyMsg = regionInfo.container.querySelector('.region-empty');
    if (emptyMsg) {
      emptyMsg.remove();
    }

    // For sidebar region, render directly without wrapper (sidebar manages its own UI)
    if (region === 'sidebar') {
      const content = document.createElement('div');
      content.className = 'fynapp-render-target sidebar-content';
      content.style.cssText = 'height: 100%; display: flex; flex-direction: column;';
      // Use fynApp.name as ID so design-tokens CSS scoping works correctly
      content.id = fynApp.name;
      regionInfo.container.appendChild(content);
      this.fynappContainers.set(fynApp.name, content);

      // Track in regionFynApps
      regionApps.set(fynApp.name, { container: content, fynApp });

      // For sidebar apps (like fynapp-sidebar), try rendering via ./component export
      // This won't double-render because sidebar app doesn't use execution override
      await this.tryRenderComponent(fynApp, content);
      return;
    }

    // For main region, use container with header
    const appContainer = document.createElement('div');
    appContainer.className = 'fynapp-container';
    appContainer.id = `fynapp-container-${fynApp.name}`;

    // Add header with unload button (unloads just THIS FynApp, not the region)
    const header = document.createElement('div');
    header.className = 'fynapp-header';
    header.innerHTML = `
      <div>
        <strong style="color: #374151;">${fynApp.name}</strong>
        <span style="font-size: 0.75rem; color: #9ca3af; margin-left: 0.5rem;">v${fynApp.version}</span>
      </div>
      <button class="btn-clear" data-fynapp="${fynApp.name}" data-region="${region}" title="Unload this FynApp">✕</button>
    `;

    // Add content area
    const content = document.createElement('div');
    content.className = 'fynapp-render-target';
    // Use fynApp.name as ID so design-tokens CSS scoping works correctly
    content.id = fynApp.name;

    appContainer.appendChild(header);
    appContainer.appendChild(content);
    regionInfo.container.appendChild(appContainer);

    // Store container reference
    this.fynappContainers.set(fynApp.name, content);

    // Track in regionFynApps (use appContainer not content, so we can hide the whole thing)
    regionApps.set(fynApp.name, { container: appContainer, fynApp });

    // Set up unload button - unloads just this FynApp
    const unloadBtn = header.querySelector('.btn-clear') as HTMLButtonElement;
    if (unloadBtn) {
      unloadBtn.addEventListener('click', () => {
        this.unloadFynAppFromRegion(fynApp.name, region);
      });
    }

    // For apps loaded via loadIntoRegion, try rendering via ./component export
    // This handles apps that use the component pattern (like AG Grid)
    await this.tryRenderComponent(fynApp, content);
  }

  private async manageAppLayout(fynApp: FynApp): Promise<void> {
    // Check if this FynApp is being loaded via loadIntoRegion (has a pending region)
    const targetRegion = this.pendingRegionLoad.get(fynApp.name);
    if (targetRegion) {
      // Clear the pending load - the loadIntoRegion will handle rendering
      this.pendingRegionLoad.delete(fynApp.name);
      console.debug(`🎨 Managing layout for ${fynApp.name} in ${targetRegion} region (via loadIntoRegion)`);

      const regionInfo = this.regions.get(targetRegion);
      if (!regionInfo?.container) {
        console.warn(`⚠️ Region ${targetRegion} container not available for ${fynApp.name}`);
        return;
      }

      // Update region tracking
      regionInfo.fynAppId = fynApp.name;
      regionInfo.fynApp = fynApp;
      this.loadedFynApps.set(fynApp.name, fynApp);

      // Render into the specified region
      await this.renderFynAppIntoRegion(fynApp, targetRegion);
      this.updateLoadedCount();
      console.debug(`✅ Layout managed for ${fynApp.name} in ${targetRegion}`);
      return;
    }

    // Fallback: Use the main region by default for auto-managed apps (not loaded via loadIntoRegion)
    const mainRegion = this.regions.get('main');
    if (!mainRegion?.container) {
      console.warn(`⚠️ Main region container not available for ${fynApp.name}`);
      return;
    }

    console.debug(`🎨 Managing layout for ${fynApp.name} in main region (default)`);

    // Update tracking for main region
    mainRegion.fynAppId = fynApp.name;
    mainRegion.fynApp = fynApp;
    this.loadedFynApps.set(fynApp.name, fynApp);

    // Render into the main region
    await this.renderFynAppIntoRegion(fynApp, 'main');
    this.updateLoadedCount();

    console.debug(`✅ Layout managed for ${fynApp.name}`);
  }

  private async loadFynApp(fynappUrl: string): Promise<FynApp | null> {
    if (!this.kernel) {
      console.error("❌ Kernel not available for dynamic loading");
      return null;
    }

    try {
      console.log(`🔄 Loading FynApp from ${fynappUrl}`);
      const fynApp = await this.kernel.loadFynApp(fynappUrl);

      if (fynApp) {
        console.log(`✅ Successfully loaded and bootstrapped FynApp: ${fynApp.name}`);
        return fynApp;
      }

      return null;
    } catch (error) {
      console.error(`❌ Failed to load FynApp from ${fynappUrl}:`, (error as Error).message);
      throw error;
    }
  }

  private async unloadFynApp(fynappName: string): Promise<void> {
    console.log(`🗑️ Unloading FynApp: ${fynappName}`);

    // Find which region contains this FynApp and clear it
    for (const [regionName, regionInfo] of this.regions) {
      if (regionInfo.fynAppId === fynappName) {
        this.clearRegion(regionName);
        console.log(`✅ Unloaded FynApp: ${fynappName} from ${regionName}`);
        return;
      }
    }

    // Fallback: just remove from tracking if not found in regions
    this.loadedFynApps.delete(fynappName);
    this.fynappContainers.delete(fynappName);
    this.updateLoadedCount();
    console.log(`✅ Unloaded FynApp: ${fynappName}`);
  }

  private renderIntoShell(fynappName: string, content: string | HTMLElement): void {
    const appContent = document.getElementById(`fynapp-content-${fynappName}`);
    if (appContent) {
      if (typeof content === 'string') {
        appContent.innerHTML = content;
      } else {
        appContent.innerHTML = '';
        appContent.appendChild(content);
      }
      appContent.style.cssText = `
        min-height: 100px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 1rem;
      `;
      console.debug(`🎨 Rendered content for ${fynappName}`);
    }
  }

  private updateLoadedCount(): void {
    const countElement = document.getElementById('loaded-count');
    if (countElement) {
      // Count all FynApps across all regions (including hidden ones)
      let total = 0;
      for (const regionApps of this.regionFynApps.values()) {
        total += regionApps.size;
      }
      countElement.textContent = total.toString();
    }
    this.updateFooterStatus();
  }

  private updateFooterStatus(loading?: string): void {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const activeFynapp = document.getElementById('active-fynapp');
    const middlewareCount = document.getElementById('middleware-count');

    if (loading) {
      statusDot?.classList.add('loading');
      if (statusText) statusText.textContent = `Loading ${loading}...`;
    } else {
      statusDot?.classList.remove('loading');
      if (statusText) statusText.textContent = 'Ready';
    }

    // Update active FynApp display
    const mainRegion = this.regions.get('main');
    if (activeFynapp) {
      if (mainRegion?.fynApp) {
        activeFynapp.textContent = `${mainRegion.fynApp.name} v${mainRegion.fynApp.version}`;
      } else {
        activeFynapp.textContent = 'No active FynApp';
      }
    }

    // Update middleware count from kernel if available
    if (middlewareCount && this.kernel) {
      try {
        const mwRegistry = (this.kernel as any).runTime?.middlewares || {};
        const count = Object.keys(mwRegistry).length;
        middlewareCount.textContent = `${count} middleware${count !== 1 ? 's' : ''}`;
      } catch {
        middlewareCount.textContent = '0 middlewares';
      }
    }
  }

  private async tryRenderComponent(fynApp: FynApp, container: HTMLElement): Promise<void> {
    try {
      console.log(`🔍 Attempting to load component for ${fynApp.name}`);

      // Try to load the component module (this will load it if it exists)
      try {
        const componentModule = await fynApp.entry.get('./component');
        const componentExport = componentModule();

        if (componentExport && componentExport.component) {
          console.log(`🎨 Found component export for ${fynApp.name}, rendering...`);

          // Extract the actual React component and React dependencies from the FynApp
          const componentData = componentExport.component;
          const ReactComponent = componentData.component;
          const React = componentData.react;
          const ReactDOM = componentData.reactDOM;

          if (!ReactComponent || typeof ReactComponent !== 'function') {
            console.error(`❌ Invalid component for ${fynApp.name}:`, componentData);
            throw new Error(`Component is not a valid React component function`);
          }

          if (!React || !ReactDOM) {
            console.error(`❌ FynApp ${fynApp.name} must provide react and reactDOM in component export`);
            throw new Error(`FynApp must provide react and reactDOM dependencies`);
          }

          // Use FynApp's React to create element and FynApp's ReactDOM to render
          const element = React.createElement(ReactComponent, {
            fynApp: fynApp,
            runtime: this.shellRuntime
          });

          // Use FynApp's ReactDOM to create root and render
          const root = ReactDOM.createRoot(container);
          root.render(element);

          console.log(`✅ Component rendered for ${fynApp.name}`);
          return; // Successfully rendered
        } else {
          console.log(`📝 Component module loaded but no component found for ${fynApp.name}`);
        }
      } catch (error) {
        console.log(`📝 No component module found for ${fynApp.name} (this is normal for non-component FynApps)`);
      }

      // Try to re-execute self-managed FynApps by calling their execute() method
      // This handles the case where a previously loaded FynApp is being re-rendered
      const reRendered = await this.tryReExecuteFynUnit(fynApp, container);
      if (reRendered) {
        return;
      }

      // Fallback to placeholder
      this.fallbackRender(container, fynApp.name);
    } catch (error) {
      console.error(`❌ Failed to render component for ${fynApp.name}:`, error);
      this.fallbackRender(container, fynApp.name);
    }
  }

  /**
   * Try to re-execute a FynApp's main FynUnit for re-rendering
   * This is used when switching back to a previously loaded self-managed FynApp
   */
  private async tryReExecuteFynUnit(fynApp: FynApp, container: HTMLElement): Promise<boolean> {
    try {
      // Get the main FynUnit from the FynApp's exposes
      const mainExport = fynApp.exposes?.["./main"]?.main;
      if (!mainExport || typeof mainExport.execute !== 'function') {
        console.debug(`📝 No executable main export for ${fynApp.name}`);
        return false;
      }

      console.log(`🔄 Re-executing FynUnit for ${fynApp.name}`);

      // Create a runtime context using the kernel's moduleLoader for proper middleware support
      const runtime = this.kernel.moduleLoader.createFynUnitRuntime(fynApp);

      // Apply middlewares to populate the runtime.middlewareContext
      // This ensures the FynApp gets access to shared middleware APIs like basic-counter
      await this.applyMiddlewaresForReExecution(fynApp, mainExport, runtime);

      // Set up the shell middleware context so the FynApp knows it's shell-managed
      runtime.middlewareContext.set(this.name, {
        isShellManaged: true,
        renderTarget: container,
        shellMode: 'component',
        loadApp: this.loadApp.bind(this),
        getAvailableApps: () => [...this.availableFynApps],
        getLoadedApps: () => Array.from(this.loadedFynApps.keys()),
      });

      // Call execute to let the FynApp render itself
      const result = await mainExport.execute(runtime);

      // Handle the result
      if (result && this.isValidExecutionResult(result)) {
        if (result.type === 'self-managed') {
          console.log(`✅ Self-managed FynApp ${fynApp.name} re-rendered successfully`);
          this.selfManagedApps.set(fynApp.name, result);
          return true;
        }
        // Handle other result types if needed
        await this.handleTypedExecutionResult(fynApp.name, result);
        return true;
      }

      console.log(`✅ FynUnit executed for ${fynApp.name}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to re-execute FynUnit for ${fynApp.name}:`, error);
      return false;
    }
  }

  /**
   * Apply middlewares for re-execution to populate the runtime's middlewareContext
   * This is needed when re-rendering a FynApp that uses middleware-provided APIs
   */
  private async applyMiddlewaresForReExecution(fynApp: FynApp, fynUnit: any, runtime: any): Promise<void> {
    // Get auto-apply middlewares from the kernel's middleware manager
    const autoApplyMiddlewares = this.kernel.middlewareManager?.getAutoApplyMiddlewares?.();
    if (!autoApplyMiddlewares) {
      console.debug(`📝 No auto-apply middlewares available for ${fynApp.name}`);
      return;
    }

    // Apply middlewares that target fynapps (not middleware providers)
    const targetMiddlewares = autoApplyMiddlewares.fynapp || [];

    for (const mwReg of targetMiddlewares) {
      // Skip the shell middleware - we handle it separately
      if (mwReg.middleware.name === this.name) continue;

      // Check if middleware has a filter function
      if (mwReg.middleware.shouldApply) {
        try {
          if (!mwReg.middleware.shouldApply(fynApp)) {
            continue;
          }
        } catch (error) {
          console.warn(`Error in shouldApply for ${mwReg.regKey}:`, error);
          continue;
        }
      }

      // Create a context for the middleware apply call
      const context = {
        meta: {
          info: {
            name: mwReg.middleware.name,
            provider: mwReg.hostFynApp.name,
            version: mwReg.hostFynApp.version,
          },
          config: {},
        },
        fynUnit,
        fynMod: fynUnit,
        fynApp,
        reg: mwReg,
        runtime,
        kernel: this.kernel,
        status: "ready" as const,
      };

      try {
        // Call setup to initialize middleware state
        if (mwReg.middleware.setup) {
          await mwReg.middleware.setup(context);
        }
        // Call apply to populate middlewareContext
        if (mwReg.middleware.apply) {
          await mwReg.middleware.apply(context);
        }
      } catch (error) {
        console.warn(`Failed to apply middleware ${mwReg.regKey} for re-execution:`, error);
      }
    }

    // Also apply middlewares from the FynUnit's __middlewareMeta if present
    if (fynUnit.__middlewareMeta) {
      for (const meta of fynUnit.__middlewareMeta) {
        if (typeof meta === 'object' && meta.middleware) {
          // Parse the middleware string to get the name
          const parts = (meta.middleware as string).trim().split(' ');
          if (parts.length >= 3 && parts[0] === '-FYNAPP_MIDDLEWARE') {
            const middlewareName = parts[2].split('/').pop() || parts[2];
            const mwReg = this.kernel.getMiddleware(middlewareName, parts[1]);

            if (mwReg && mwReg.regKey) {
              const context = {
                meta: {
                  info: {
                    name: mwReg.middleware.name,
                    provider: mwReg.hostFynApp.name,
                    version: mwReg.hostFynApp.version,
                  },
                  config: meta.config || {},
                },
                fynUnit,
                fynMod: fynUnit,
                fynApp,
                reg: mwReg,
                runtime,
                kernel: this.kernel,
                status: "ready" as const,
              };

              try {
                if (mwReg.middleware.setup) {
                  await mwReg.middleware.setup(context);
                }
                if (mwReg.middleware.apply) {
                  await mwReg.middleware.apply(context);
                }
              } catch (error) {
                console.warn(`Failed to apply declared middleware ${mwReg.regKey}:`, error);
              }
            }
          }
        }
      }
    }
  }

  // Execution override methods
  canOverrideExecution(fynApp: FynApp, fynUnit: FynUnit): boolean {
    // Override execution only if shell is available and FynApp is not the shell itself
    const mainRegion = this.regions.get('main');
    return !!mainRegion?.container && fynApp.name !== 'fynapp-shell-mw';
  }

  async overrideInitialize(context: FynAppMiddlewareCallContext): Promise<{ status: string; mode?: string }> {
    const { fynUnit, fynApp, runtime } = context;

    console.debug(`🎭 Shell middleware overriding initialize for ${fynApp.name}`);

    // Enhance runtime with shell-specific context
    runtime.middlewareContext.set(this.name, {
      ...runtime.middlewareContext.get(this.name),
      isShellManaged: true,
      renderTarget: this.getOrCreateRenderTarget(fynApp.name),
      shellMode: 'component',
    });

    // Call original initialize if it exists, with enhanced context
    if (fynUnit.initialize) {
      const result = await fynUnit.initialize(runtime);
      console.debug(`🎭 Original initialize returned:`, result);
      return { ...result, mode: 'shell-managed' };
    }

    return { status: 'ready', mode: 'shell-managed' };
  }

  async overrideExecute(context: FynAppMiddlewareCallContext): Promise<void> {
    const { fynUnit, fynApp, runtime } = context;

    console.debug(`🎭 Shell middleware overriding execute for ${fynApp.name}`);

    // Execute with proper type handling
    const result = await this.executeWithShellContext(fynUnit, runtime);

    // Type-safe result handling
    if (result) {
      await this.handleTypedExecutionResult(fynApp.name, result);
    } else {
      // No typed result - try to render via ./component expose
      const container = this.fynappContainers.get(fynApp.name);
      if (container) {
        await this.tryRenderComponent(fynApp, container);
      }
    }
  }

  private async executeWithShellContext(fynUnit: FynUnit, runtime: any): Promise<ShellExecutionResult | null> {
    if (!fynUnit.execute) return null;

    try {
      const result = await fynUnit.execute(runtime);

      // Type guard to ensure we have a proper shell result
      if (result && this.isValidExecutionResult(result)) {
        return result;
      }

      return null;

    } catch (error) {
      console.error(`❌ Error in shell-aware execute:`, error);
      throw error;
    }
  }

  // Type guard function for shell execution results
  private isValidExecutionResult(result: any): result is ShellExecutionResult {
    return result &&
           typeof result === 'object' &&
           typeof result.type === 'string' &&
           ['component-factory', 'rendered-content', 'self-managed', 'no-render', 'react-component', 'render-function'].includes(result.type);
  }

  private async handleTypedExecutionResult(fynAppName: string, result: ShellExecutionResult): Promise<void> {
    console.debug(`🎨 Handling typed execution result for ${fynAppName}:`, result.type);

    switch (result.type) {
      case 'component-factory':
        await this.renderComponentFactory(fynAppName, result.componentFactory);
        break;

      case 'rendered-content':
        this.renderContent(fynAppName, result.content);
        break;

      case 'self-managed':
        this.handleSelfManaged(fynAppName, result);
        break;

      case 'no-render':
        console.debug(`📝 ${fynAppName} chose not to render: ${result.message || 'No reason provided'}`);
        this.renderNoContent(fynAppName, result.message);
        break;

      case 'react-component':
        await this.renderReactComponent(fynAppName, result);
        break;

      case 'render-function':
        await this.renderWithFunction(fynAppName, result);
        break;

      default:
        // TypeScript will catch this as unreachable if all cases are handled
        const exhaustiveCheck: never = result;
        console.warn(`🤷 Unknown result type for ${fynAppName}:`, exhaustiveCheck);
        this.fallbackRender(this.getAppContainer(fynAppName), fynAppName);
    }
  }

  private async renderReactComponent(fynAppName: string, result: ReactComponentResult): Promise<void> {
    const container = this.getAppContainer(fynAppName);

    // Use FynApp's React/ReactDOM if provided, otherwise use shell's
    const React = result.react || await this.getShellReact();
    const ReactDOM = result.reactDOM || await this.getShellReactDOM();

    try {
      const element = React.createElement(result.component, {
        fynAppName,
        runtime: this.shellRuntime,
        ...result.props
      });

      // Reuse existing root or create new one
      let root = this.reactRoots.get(fynAppName);
      if (!root) {
        root = ReactDOM.createRoot(container);
        this.reactRoots.set(fynAppName, root);
      }
      root.render(element);

      console.log(`✅ React component rendered for ${fynAppName}`);
    } catch (error) {
      console.error(`❌ Failed to render React component for ${fynAppName}:`, error);
      this.fallbackRender(container, fynAppName);
    }
  }

  private async renderWithFunction(fynAppName: string, result: RenderFunctionResult): Promise<void> {
    const container = this.getAppContainer(fynAppName);

    try {
      await result.render(container);
      console.log(`✅ Render function executed for ${fynAppName}`);
    } catch (error) {
      console.error(`❌ Failed to execute render function for ${fynAppName}:`, error);
      this.fallbackRender(container, fynAppName);
    }
  }

  private async renderComponentFactory(fynAppName: string, componentFactory: ComponentFactoryResult['componentFactory']): Promise<void> {
    const container = this.getAppContainer(fynAppName);

    const React = await this.getShellReact();
    const ReactDOM = await this.getShellReactDOM();

    try {
      const { component: Component, props = {} } = componentFactory(React);
      // Note: Don't pass runtime here - component factories already capture the correct
      // runtime in their closure. Passing shell's runtime would overwrite it.
      const element = React.createElement(Component, {
        fynAppName,
        ...props
      });

      // Reuse existing root or create new one
      let root = this.reactRoots.get(fynAppName);
      if (!root) {
        root = ReactDOM.createRoot(container);
        this.reactRoots.set(fynAppName, root);
      }
      root.render(element);

      console.log(`✅ Component factory rendered for ${fynAppName}`);

    } catch (error) {
      console.error(`❌ Failed to render component factory for ${fynAppName}:`, error);
      this.fallbackRender(container, fynAppName);
    }
  }

  private renderContent(fynAppName: string, content: HTMLElement | string): void {
    const container = this.getAppContainer(fynAppName);
    
    if (typeof content === 'string') {
      container.innerHTML = content;
    } else {
      container.innerHTML = '';
      container.appendChild(content);
    }
    
    console.debug(`🎨 Content rendered for ${fynAppName}`);
  }

  private handleSelfManaged(fynAppName: string, result: SelfManagedResult): void {
    console.debug(`🔧 ${fynAppName} is self-managing DOM in target:`, result.target);
    this.selfManagedApps.set(fynAppName, result);
  }

  private renderNoContent(fynAppName: string, message?: string): void {
    const container = this.getAppContainer(fynAppName);
    container.innerHTML = `
      <div style="padding: 1rem; text-align: center; color: #6b7280;">
        <p>📦 ${fynAppName}</p>
        <p><small>${message || 'No content to render'}</small></p>
      </div>
    `;
  }

  private getOrCreateRenderTarget(fynAppName: string): HTMLElement {
    const container = this.getAppContainer(fynAppName);
    return container;
  }

  private getAppContainer(fynAppName: string): HTMLElement {
    const existing = this.fynappContainers.get(fynAppName);
    if (existing) return existing;

    // Create a new container if it doesn't exist
    const container = document.createElement('div');
    container.className = 'fynapp-render-target';
    this.fynappContainers.set(fynAppName, container);
    return container;
  }

  private async getShellReact(): Promise<any> {
    // For now, let's import React dynamically
    // In a real implementation, the shell would have its own React version
    const React = await import('react');
    return React.default;
  }

  private async getShellReactDOM(): Promise<any> {
    // For now, let's import ReactDOM dynamically
    // In a real implementation, the shell would have its own ReactDOM version
    const ReactDOM = await import('react-dom/client');
    return ReactDOM.default;
  }

  private fallbackRender(container: HTMLElement, fynAppName: string): void {
    container.innerHTML = `
      <div style="padding: 1rem; text-align: center; color: #6b7280;">
        <p>📦 ${fynAppName} loaded</p>
        <p><small>Component will render here if available</small></p>
      </div>
    `;
  }
}

// Export the middleware instance for kernel auto-discovery
export const __middleware__ShellLayout = new ShellLayoutMiddleware();
