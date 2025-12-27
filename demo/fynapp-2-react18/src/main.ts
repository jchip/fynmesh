import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import React from "esm-react";
import ReactDOMClient from "esm-react-dom";
import App from "./App";
import { preloadComponents, ComponentLibrary } from "./components";

/**
 * Standardized middleware user interface with upgrade support
 */
class MiddlewareUser implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;
  private kernelEvents?: EventTarget;
  private middlewareReadyHandler?: (event: Event) => void;
  private componentLibrary?: ComponentLibrary;
  private runtime?: FynUnitRuntime;

  /**
   * Tell middleware what we need - called first to determine readiness
   */
  initialize(runtime: FynUnitRuntime) {
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const config = basicCounterData?.config;

    console.debug(
      `📋 ${runtime.fynApp.name} initialize called with config:`,
      config
    );

    // We're a consumer - can render without provider, counter just won't work
    return {
      status: "ready",
      mode: "consumer",
      deferOk: true,
    };
  }

  /**
   * Main function - called when middleware is ready
   */
  async execute(runtime: FynUnitRuntime) {
    this.runtime = runtime;

    console.debug("MiddlewareUser.main called", {
      fynApp: runtime.fynApp.name,
    });
    console.debug(
      `Bootstrapping ${runtime.fynApp.name} with React ${React.version}`
    );

    // Check if shell middleware is managing this execution
    const shellMiddleware = runtime.middlewareContext.get("shell-layout");
    const isShellManaged = shellMiddleware?.isShellManaged;

    console.debug(`${runtime.fynApp.name} isShellManaged check:`, isShellManaged);
    if (isShellManaged) {
      console.debug(`✅ ${runtime.fynApp.name} is shell-managed, skipping direct DOM rendering`);
      return;
    }
    console.debug(`⚠️ ${runtime.fynApp.name} is NOT shell-managed, proceeding with direct DOM rendering`);

    // Find or create the div element to render into
    let targetDiv = document.getElementById("fynapp-2-react18");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-2-react18";
      document.body.appendChild(targetDiv);
    }

    // Load components from fynapp-x1
    if (!this.componentLibrary) {
      try {
        this.componentLibrary = await preloadComponents();
        console.debug("Successfully loaded component library from fynapp-x1");
      } catch (error) {
        console.error("Failed to load components from fynapp-x1:", error);
        targetDiv.innerHTML = `
          <div style="padding: 20px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
            <h3>Error Loading Components</h3>
            <p>Failed to load component library from fynapp-x1. Check console for details.</p>
            <button onclick="location.reload()">Retry</button>
          </div>
        `;
        return;
      }
    }

    // Get the basic counter middleware data to access config
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
      "🔍 fynapp-2-react18: Available middleware APIs:",
      Array.from(runtime.middlewareContext.keys())
    );
    console.debug("🔍 fynapp-2-react18: Middleware config:", middlewareConfig);
    console.debug("🔍 fynapp-2-react18: Counter API available:", !!basicCounterData);

    // Render the React component with middleware config
    if (!this.root) {
      this.root = ReactDOMClient.createRoot ? ReactDOMClient.createRoot(targetDiv) : ReactDOMClient.default.createRoot(targetDiv);
    }

    const renderApp = () => {
      const counterData = runtime.middlewareContext.get("basic-counter");
      const config = counterData?.config || { count: 0 };
      this.root!.render(
        React.createElement(App, {
          appName: runtime.fynApp.name,
          components: this.componentLibrary,
          middlewareConfig: config,
          runtime, // Pass runtime for middleware context access
        })
      );
    };

    renderApp();

    // Listen for MIDDLEWARE_READY events to upgrade when counter becomes available
    const kernel: any = (globalThis as any).fynMeshKernel;
    const events: EventTarget | undefined = kernel?.events;
    if (events && !this.middlewareReadyHandler) {
      this.kernelEvents = events;
      this.middlewareReadyHandler = (event: Event) => {
        const detail: any = (event as any).detail;
        if (detail?.name !== "basic-counter") return;
        if (detail?.cc?.fynApp?.name !== runtime.fynApp.name) return;

        const updated = runtime.middlewareContext.get("basic-counter");
        if (updated) {
          console.log("✅ fynapp-2-react18: basic-counter became ready, re-rendering with counter API");
          renderApp();
        }
      };
      events.addEventListener("MIDDLEWARE_READY", this.middlewareReadyHandler);
    }
  }

  shutdown(): void {
    if (this.kernelEvents && this.middlewareReadyHandler) {
      this.kernelEvents.removeEventListener("MIDDLEWARE_READY", this.middlewareReadyHandler);
    }
    this.root?.unmount();
    this.root = undefined;
    this.kernelEvents = undefined;
    this.middlewareReadyHandler = undefined;
    this.componentLibrary = undefined;
    this.runtime = undefined;
  }
}

// Export the middleware usage with standardized interface
// This app is a consumer - it consumes the basic counter config from the provider
export const main = useMiddleware(
  {
      // @ts-ignore - TS can't understand module federation remote containers
    middleware: import('fynapp-react-middleware/main/basic-counter',
        { with: { type: "fynapp-middleware" } }),
    config: "consume-only", // Consumer - uses config from provider
  },
  new MiddlewareUser()
);
