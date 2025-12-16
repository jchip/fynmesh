import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import type { SelfManagedResult } from "fynapp-shell-mw/middleware/shell-layout";
import React from "react";
import { version as ReactDomVersion } from "react-dom";
import ReactDomClient from "react-dom/client";
import App from "./App";

/**
 * Standardized middleware user interface
 */
class MiddlewareUser implements FynUnit {
  private root?: ReturnType<typeof ReactDomClient.createRoot>;
  private kernelEvents?: EventTarget;
  private middlewareReadyHandler?: (event: Event) => void;

  /**
   * Tell middleware what we need - called first to determine readiness
   */
  initialize(runtime: FynUnitRuntime) {
    console.log("MiddlewareUser.initialize called", {
      fynApp: runtime.fynApp.name,
      config: runtime.config,
    });

    // Check if counter middleware is available
    const counterAPI = runtime.middlewareContext.get("basic-counter");

    // We're OK with defer - we can render without the counter and upgrade later
    // This allows the app to continue execution even if the provider isn't loaded yet
    return {
      status: "ready", // Always ready - we handle missing MW gracefully
      mode: "consumer", // We are a consumer of shared counter
      deferOk: true, // Signal that we can handle deferred middleware
    };
  }

  /**
   * Do our actual work - called when middleware is ready
   */
  async execute(runtime: FynUnitRuntime): Promise<SelfManagedResult> {
    console.log("MiddlewareUser.main called", { fynApp: runtime.fynApp.name });
    console.log(
      `Bootstrapping ${runtime.fynApp.name}...`,
      React,
      ReactDomClient,
      "versions",
      React.version,
      ReactDomVersion
    );

    // Find or create the div element to render into
    // Priority: shell-managed container > standalone pre-defined container > create new
    let targetDiv = document.getElementById(`shell-fynapp-${runtime.fynApp.name}`);

    if (!targetDiv) {
      // Fallback for standalone mode (no shell)
      targetDiv = document.getElementById("fynapp-6-react");
      if (!targetDiv) {
        targetDiv = document.createElement("div");
        targetDiv.id = "fynapp-6-react";
        document.body.appendChild(targetDiv);
      }
    }

    // Get basic-counter middleware API
    const counterAPI = runtime.middlewareContext.get("basic-counter");
    console.log('🔍 fynapp-6-react: Counter API from middleware:', !!counterAPI);

    if (!counterAPI) {
      console.warn('⚠️ fynapp-6-react: Counter provider not available. App will render without counter functionality.');
      console.warn('💡 Tip: Load FynApp 1 first to enable shared counter functionality.');
    }

    // Render the React component with counter API (may be undefined)
    if (!this.root) {
      this.root = ReactDomClient.createRoot(targetDiv);
    }

    const renderApp = (api: any) => {
      this.root!.render(
        React.createElement(App, {
          appName: runtime.fynApp.name,
          counterAPI: api,
        })
      );
    };

    renderApp(counterAPI);

    // If the counter middleware isn't ready yet, re-render once it becomes ready.
    // This enables the "degrade then upgrade" UX in the shell demo.
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
          console.log("✅ fynapp-6-react: basic-counter became ready, re-rendering with counter API");
          renderApp(updated);
        }
      };
      events.addEventListener("MIDDLEWARE_READY", this.middlewareReadyHandler);
    }

    console.log(`${runtime.fynApp.name} bootstrapped successfully`);

    // Return self-managed result to tell shell middleware we've handled rendering
    return { type: 'self-managed', target: targetDiv };
  }

  shutdown(): void {
    if (this.kernelEvents && this.middlewareReadyHandler) {
      this.kernelEvents.removeEventListener("MIDDLEWARE_READY", this.middlewareReadyHandler);
    }
    this.root?.unmount();
    this.root = undefined;
    this.kernelEvents = undefined;
    this.middlewareReadyHandler = undefined;
  }
}

// Export the middleware usage with standardized interface
// This app is a consumer of the shared counter
export const main = useMiddleware(
  {
    // @ts-ignore - TS can't understand module federation remote containers
    middleware: import('fynapp-react-middleware/main/basic-counter',
        { with: { type: "fynapp-middleware" } }),
    config: "consume-only", // Consumer only - uses shared counter from provider
  },
  new MiddlewareUser()
);
