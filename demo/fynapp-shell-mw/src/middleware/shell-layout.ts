import type { 
  FynAppMiddleware, 
  FynAppMiddlewareCallContext, 
  FynApp, 
  FynModule,
  FynModuleResult,
  ComponentFactoryResult,
  RenderedContentResult,
  SelfManagedResult,
  NoRenderResult
} from "@fynmesh/kernel";

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

  // Multi-region layout support
  private regions = new Map<RegionName, RegionInfo>([
    ['sidebar', { container: null, fynAppId: null, fynApp: null }],
    ['main', { container: null, fynAppId: null, fynApp: null }],
  ]);
  private selectedRegion: RegionName = 'main'; // Default region for loading
  private pendingRegionLoad = new Map<string, RegionName>(); // Track which region a FynApp is being loaded into

  // Available FynApps for dynamic loading - exposed via getAvailableApps()
  private availableFynApps = [
    { id: "fynapp-1", name: "FynApp 1 (React 19)", url: "/fynapp-1/dist", framework: "React 19" },
    { id: "fynapp-1-b", name: "FynApp 1-B (React 19)", url: "/fynapp-1-b/dist", framework: "React 19" },
    { id: "fynapp-2-react18", name: "FynApp 2 (React 18)", url: "/fynapp-2-react18/dist", framework: "React 18" },
    { id: "fynapp-6-react", name: "FynApp 6 (React)", url: "/fynapp-6-react/dist", framework: "React" },
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          background: #4f46e5;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
        }
        .btn-load:hover { background: #4338ca; }
        .btn-load:disabled { background: #9ca3af; cursor: not-allowed; }
        .btn-clear {
          padding: 0.25rem 0.5rem;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.75rem;
        }
        .btn-clear:hover { background: #dc2626; }
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
    // Clear all regions
    this.clearRegion('main');
    this.clearRegion('sidebar');
    this.loadedFynApps.clear();
    this.fynappContainers.clear();
    this.updateLoadedCount();
    console.log("🧹 All content cleared");
  }

  private clearRegion(region: RegionName): void {
    const regionInfo = this.regions.get(region);
    if (!regionInfo?.container) return;

    // Clear the fynapp tracking for this region
    if (regionInfo.fynAppId) {
      this.loadedFynApps.delete(regionInfo.fynAppId);
      this.fynappContainers.delete(regionInfo.fynAppId);
    }

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
    console.log(`🧹 Region ${region} cleared`);
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

    // Clear the region
    regionInfo.container.innerHTML = '';

    // For sidebar region, render directly without wrapper (sidebar manages its own UI)
    if (region === 'sidebar') {
      const content = document.createElement('div');
      content.className = 'fynapp-render-target sidebar-content';
      content.style.cssText = 'height: 100%; display: flex; flex-direction: column;';
      regionInfo.container.appendChild(content);
      this.fynappContainers.set(fynApp.name, content);
      await this.tryRenderComponent(fynApp, content);
      return;
    }

    // For main region, use container with header
    const appContainer = document.createElement('div');
    appContainer.className = 'fynapp-container';
    appContainer.id = `fynapp-container-${fynApp.name}`;

    // Add header with unload button
    const header = document.createElement('div');
    header.className = 'fynapp-header';
    header.innerHTML = `
      <div>
        <strong style="color: #374151;">${fynApp.name}</strong>
        <span style="font-size: 0.75rem; color: #9ca3af; margin-left: 0.5rem;">v${fynApp.version}</span>
      </div>
      <button class="btn-clear" data-fynapp="${fynApp.name}" data-region="${region}">✕</button>
    `;

    // Add content area
    const content = document.createElement('div');
    content.className = 'fynapp-render-target';

    appContainer.appendChild(header);
    appContainer.appendChild(content);
    regionInfo.container.appendChild(appContainer);

    // Store container reference
    this.fynappContainers.set(fynApp.name, content);

    // Set up unload button
    const unloadBtn = header.querySelector('.btn-clear') as HTMLButtonElement;
    if (unloadBtn) {
      unloadBtn.addEventListener('click', () => {
        this.clearRegion(region);
      });
    }

    // Try to render the component
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
      countElement.textContent = this.loadedFynApps.size.toString();
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

      // Fallback to placeholder
      this.fallbackRender(container, fynApp.name);
    } catch (error) {
      console.error(`❌ Failed to render component for ${fynApp.name}:`, error);
      this.fallbackRender(container, fynApp.name);
    }
  }

  // NEW: Execution override methods
  canOverrideExecution(fynApp: FynApp, fynModule: FynModule): boolean {
    // Override execution only if shell is available and FynApp is not the shell itself
    const mainRegion = this.regions.get('main');
    return !!mainRegion?.container && fynApp.name !== 'fynapp-shell-mw';
  }

  async overrideInitialize(context: FynAppMiddlewareCallContext): Promise<{ status: string; mode?: string }> {
    const { fynMod, fynApp, runtime } = context;
    
    console.debug(`🎭 Shell middleware overriding initialize for ${fynApp.name}`);
    
    // Enhance runtime with shell-specific context
    runtime.middlewareContext.set(this.name, {
      ...runtime.middlewareContext.get(this.name),
      isShellManaged: true,
      renderTarget: this.getOrCreateRenderTarget(fynApp.name),
      shellMode: 'component',
    });

    // Call original initialize if it exists, with enhanced context
    if (fynMod.initialize) {
      const result = await fynMod.initialize(runtime);
      console.debug(`🎭 Original initialize returned:`, result);
      return { ...result, mode: 'shell-managed' };
    }
    
    return { status: 'ready', mode: 'shell-managed' };
  }

  async overrideExecute(context: FynAppMiddlewareCallContext): Promise<void> {
    const { fynMod, fynApp, runtime } = context;
    
    console.debug(`🎭 Shell middleware overriding execute for ${fynApp.name}`);

    // Execute with proper type handling
    const result = await this.executeWithShellContext(fynMod, runtime);
    
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

  private async executeWithShellContext(fynMod: FynModule, runtime: any): Promise<FynModuleResult | null> {
    if (!fynMod.execute) return null;

    try {
      const result = await fynMod.execute(runtime);
      
      // Type guard to ensure we have a proper result
      if (result && this.isValidExecutionResult(result)) {
        return result;
      }
      
      return null;
      
    } catch (error) {
      console.error(`❌ Error in shell-aware execute:`, error);
      throw error;
    }
  }

  // Type guard function
  private isValidExecutionResult(result: any): result is FynModuleResult {
    return result && 
           typeof result === 'object' && 
           typeof result.type === 'string' &&
           ['component-factory', 'rendered-content', 'self-managed', 'no-render'].includes(result.type);
  }

  private async handleTypedExecutionResult(fynAppName: string, result: FynModuleResult): Promise<void> {
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
        
      default:
        // TypeScript will catch this as unreachable if all cases are handled
        const exhaustiveCheck: never = result;
        console.warn(`🤷 Unknown result type for ${fynAppName}:`, exhaustiveCheck);
        this.fallbackRender(this.getAppContainer(fynAppName), fynAppName);
    }
  }

  private async renderComponentFactory(fynAppName: string, componentFactory: ComponentFactoryResult['componentFactory']): Promise<void> {
    const container = this.getAppContainer(fynAppName);
    
    const React = await this.getShellReact();
    const ReactDOM = await this.getShellReactDOM();
    
    try {
      const { component: Component, props = {} } = componentFactory(React);
      const element = React.createElement(Component, {
        fynAppName,
        runtime: this.shellRuntime,
        ...props
      });
      
      const root = ReactDOM.createRoot(container);
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
