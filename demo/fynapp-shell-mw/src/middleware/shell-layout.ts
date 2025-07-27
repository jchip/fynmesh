import type { FynAppMiddleware, FynAppMiddlewareCallContext, FynApp } from "@fynmesh/kernel";

export class ShellLayoutMiddleware implements FynAppMiddleware {
  public readonly name = "shell-layout";

  // Auto-apply to both regular FynApps and middleware providers (including itself)
  public readonly autoApplyScope = ["fynapp", "middleware"] as ("all" | "fynapp" | "middleware")[];

  private loadedFynApps = new Map<string, FynApp>();
  private shellContentContainer: HTMLElement | null = null;
  private shellRuntime: any = null;
  private kernel: any = null; // Store kernel reference for dynamic loading
  private fynappContainers = new Map<string, HTMLElement>(); // Store container elements for each FynApp

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
      loadFynApp: this.loadFynApp.bind(this),
      unloadFynApp: this.unloadFynApp.bind(this),
      getLoadedFynApps: () => Array.from(this.loadedFynApps.keys()),
      renderIntoShell: this.renderIntoShell.bind(this),
      isShellAvailable: () => !!this.shellContentContainer,
      initializeShell: this.initializeShellUI.bind(this),
      clearContent: this.clearContent.bind(this),
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

    // Available FynApps for dynamic loading
    const availableFynApps = [
      { id: "fynapp-1", name: "FynApp 1 (React 19)", url: "/fynapp-1/dist", framework: "React 19" },
      { id: "fynapp-1-b", name: "FynApp 1-B (React 19)", url: "/fynapp-1-b/dist", framework: "React 19" },
      { id: "fynapp-2-react18", name: "FynApp 2 (React 18)", url: "/fynapp-2-react18/dist", framework: "React 18" },
      { id: "fynapp-6-react", name: "FynApp 6 (React)", url: "/fynapp-6-react/dist", framework: "React" },
      { id: "fynapp-4-vue", name: "FynApp 4 (Vue)", url: "/fynapp-4-vue/dist", framework: "Vue" },
      { id: "fynapp-5-preact", name: "FynApp 5 (Preact)", url: "/fynapp-5-preact/dist", framework: "Preact" },
      { id: "fynapp-7-solid", name: "FynApp 7 (Solid)", url: "/fynapp-7-solid/dist", framework: "Solid" },
      { id: "fynapp-3-marko", name: "FynApp 3 (Marko)", url: "/fynapp-3-marko/dist", framework: "Marko" },
    ];

    // Create shell layout structure
    shellRoot.innerHTML = `
      <div class="shell-container">
        <!-- Header -->
        <div class="shell-header">
          <h1 style="margin: 0; font-size: 1.5rem;">🏠 FynMesh Shell Demo</h1>
          <p style="margin: 0.5rem 0 0 0; opacity: 0.9; font-size: 0.875rem;">
            Dynamic FynApp Loading & Layout Management
          </p>
        </div>

        <!-- Navigation -->
        <div class="shell-nav">
          <label style="margin-right: 0.5rem; font-weight: 500;">Load FynApp:</label>
          <select id="fynapp-selector" style="margin-right: 1rem; padding: 0.25rem 0.5rem; border: 1px solid #d1d5db; border-radius: 4px;">
            <option value="">Select a FynApp...</option>
            ${availableFynApps.map(app =>
      `<option value="${app.url}" data-id="${app.id}">${app.name}</option>`
    ).join('')}
          </select>
          <button id="load-btn" class="btn-load" disabled>
            <span id="load-btn-text">Load</span>
            <span id="load-btn-spinner" class="loading-indicator" style="display: none; margin-left: 0.5rem;"></span>
          </button>
          <button id="clear-btn" class="btn-load" style="background: #dc2626; margin-left: 0.5rem;">
            Clear Content
          </button>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 1rem;">
            <span style="font-size: 0.875rem; color: #6b7280;">
              Loaded: <span id="loaded-count">0</span> FynApps
            </span>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="shell-main">
          <div id="shell-content" class="shell-content">
            <div class="welcome-message">
              <h2>Welcome to FynMesh Shell Demo! 🚀</h2>
              <p>Select a FynApp from the dropdown above to load it dynamically.</p>
              <p>This demonstrates how a shell FynApp can orchestrate and manage other FynApps.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Store reference to content container
    this.shellContentContainer = document.getElementById('shell-content');

    // Set up event listeners
    this.setupEventListeners();

    console.log("✅ Shell UI initialized by middleware");
  }

  private setupEventListeners(): void {
    const selector = document.getElementById('fynapp-selector') as HTMLSelectElement;
    const loadBtn = document.getElementById('load-btn') as HTMLButtonElement;
    const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;

    if (selector) {
      selector.addEventListener('change', () => {
        if (loadBtn) loadBtn.disabled = !selector.value;
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener('click', async () => {
        if (!selector.value) return;

        const selectedOption = selector.selectedOptions[0];
        const fynappId = selectedOption.dataset.id;
        const fynappUrl = selector.value;

        if (fynappId) {
          await this.handleLoadFynApp(fynappId, fynappUrl);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearContent();
      });
    }
  }

  private async handleLoadFynApp(fynappId: string, fynappUrl: string): Promise<void> {
    const loadBtn = document.getElementById('load-btn') as HTMLButtonElement;
    const loadBtnText = document.getElementById('load-btn-text');
    const loadBtnSpinner = document.getElementById('load-btn-spinner');

    try {
      // Show loading state
      if (loadBtn) loadBtn.disabled = true;
      if (loadBtnText) loadBtnText.textContent = 'Loading...';
      if (loadBtnSpinner) loadBtnSpinner.style.display = 'inline-block';

      console.log(`🔄 Loading FynApp: ${fynappId} from ${fynappUrl}`);

      // Use middleware's loadFynApp method
      const fynApp = await this.loadFynApp(fynappUrl);

      if (fynApp) {
        console.log(`✅ Successfully loaded FynApp: ${fynappId}`);
      }

    } catch (error) {
      console.error(`❌ Failed to load FynApp ${fynappId}:`, (error as Error).message);
      // Show error in content area
      if (this.shellContentContainer) {
        this.shellContentContainer.innerHTML = `
          <div class="error-message" style="color: #dc2626; padding: 1rem; border: 1px solid #fecaca; border-radius: 4px; background: #fef2f2;">
            <h3>❌ Failed to load ${fynappId}</h3>
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
    if (this.shellContentContainer) {
      this.shellContentContainer.innerHTML = `
        <div class="welcome-message">
          <h2>Welcome to FynMesh Shell Demo! 🚀</h2>
          <p>Select a FynApp from the dropdown above to load it dynamically.</p>
          <p>This demonstrates how a shell FynApp can orchestrate and manage other FynApps.</p>
        </div>
      `;
    }
    this.loadedFynApps.clear();
    this.updateLoadedCount();
    console.log("🧹 Content cleared by middleware");
  }

  private async manageAppLayout(fynApp: FynApp): Promise<void> {
    if (!this.shellContentContainer) {
      console.warn(`⚠️ Shell content container not available for ${fynApp.name}`);
      return;
    }

    console.debug(`🎨 Managing layout for ${fynApp.name}`);

    // Create a dedicated container for this FynApp
    const appContainer = document.createElement('div');
    appContainer.id = `fynapp-container-${fynApp.name}`;
    appContainer.className = 'fynapp-container';
    appContainer.style.cssText = `
      padding: 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 1rem;
      background: #ffffff;
    `;

    // Add app header
    const appHeader = document.createElement('div');
    appHeader.className = 'fynapp-header';
    appHeader.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #f3f4f6;
    `;

    appHeader.innerHTML = `
      <div>
        <h3 style="margin: 0; font-size: 1.125rem; color: #374151;">📦 ${fynApp.name}</h3>
        <p style="margin: 0; font-size: 0.875rem; color: #6b7280;">Version: ${fynApp.version}</p>
      </div>
      <button
        class="unload-btn"
        data-fynapp="${fynApp.name}"
        style="padding: 0.25rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem;"
      >
        ✕ Unload
      </button>
    `;

    // Add content area for the FynApp
    const appContent = document.createElement('div');
    appContent.id = `fynapp-content-${fynApp.name}`;
    appContent.className = 'fynapp-content';
    appContent.style.cssText = `
      min-height: 100px;
      background: #f9fafb;
      border: 1px dashed #d1d5db;
      border-radius: 4px;
      padding: 1rem;
    `;

    // Create a generic content container for the FynApp
    const fynappTarget = document.createElement('div');
    fynappTarget.className = 'fynapp-render-target';
    fynappTarget.style.cssText = `
      min-height: 50px;
      width: 100%;
    `;

    appContent.appendChild(fynappTarget);

    // Store the container reference for this FynApp
    this.fynappContainers.set(fynApp.name, fynappTarget);

    // Try to render FynApp component if available
    await this.tryRenderComponent(fynApp, fynappTarget);

    appContainer.appendChild(appHeader);
    appContainer.appendChild(appContent);

    // Clear welcome message and add this app container
    if (this.shellContentContainer.querySelector('.welcome-message')) {
      this.shellContentContainer.innerHTML = '';
    }

    this.shellContentContainer.appendChild(appContainer);

    // Set up unload button handler
    const unloadBtn = appHeader.querySelector('.unload-btn') as HTMLButtonElement;
    if (unloadBtn) {
      unloadBtn.addEventListener('click', () => {
        this.unloadFynApp(fynApp.name);
      });
    }

    // Store the app
    this.loadedFynApps.set(fynApp.name, fynApp);
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

    // Remove from loaded apps
    this.loadedFynApps.delete(fynappName);

    // Remove from DOM
    const appContainer = document.getElementById(`fynapp-container-${fynappName}`);
    if (appContainer) {
      appContainer.remove();
    }

    // Update count
    this.updateLoadedCount();

    // Show welcome message if no apps are loaded
    if (this.loadedFynApps.size === 0 && this.shellContentContainer) {
      this.shellContentContainer.innerHTML = `
        <div class="welcome-message">
          <h2>Welcome to FynMesh Shell Demo! 🚀</h2>
          <p>Select a FynApp from the dropdown above to load it dynamically.</p>
          <p>This demonstrates how a shell FynApp can orchestrate and manage other FynApps.</p>
        </div>
      `;
    }

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
