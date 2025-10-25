import { useMiddleware, FynModule, FynModuleRuntime } from "@fynmesh/kernel";
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
  async execute(runtime: FynModuleRuntime) {
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
    let targetDiv = document.getElementById("fynapp-6-react");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-6-react";
      document.body.appendChild(targetDiv);
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
  }
}

// Export the middleware usage with standardized interface
// This app is a consumer of the shared counter
export const main = useMiddleware(
  {
    info: {
      name: "basic-counter",
      provider: "fynapp-react-middleware",
      version: "^1.0.0",
    },
    config: "consume-only", // Consumer only - uses shared counter from provider
  },
  new MiddlewareUser()
);
