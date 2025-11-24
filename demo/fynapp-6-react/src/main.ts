import { useMiddleware, FynModule, FynModuleRuntime, SelfManagedResult } from "@fynmesh/kernel";
import React from "react";
import { version as ReactDomVersion } from "react-dom";
import ReactDomClient from "react-dom/client";
import App from "./App";

/**
 * Standardized middleware user interface
 */
class MiddlewareUser implements FynModule {
  /**
   * Tell middleware what we need - called first to determine readiness
   */
  initialize(runtime: FynModuleRuntime) {
    console.log("MiddlewareUser.initialize called", {
      fynApp: runtime.fynApp.name,
      config: runtime.config,
    });

    // Return requirements that middleware will check
    return {
      status: "ready",
      mode: "consumer", // We are a consumer of shared counter
    };
  }

  /**
   * Do our actual work - called when middleware is ready
   */
  async execute(runtime: FynModuleRuntime): Promise<SelfManagedResult> {
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

    // Render the React component with counter API
    ReactDomClient.createRoot(targetDiv).render(
      React.createElement(App, {
        appName: runtime.fynApp.name,
        counterAPI,
      })
    );

    console.log(`${runtime.fynApp.name} bootstrapped successfully`);

    // Return self-managed result to tell shell middleware we've handled rendering
    return { type: 'self-managed', target: targetDiv };
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
