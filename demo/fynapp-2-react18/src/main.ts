import { useMiddleware, FynModuleRuntime } from "@fynmesh/kernel";
import React from "react";
import { version as ReactDomVersion } from "react-dom";
import ReactDomClient from "react-dom/client";
import App from "./App";
import { preloadComponents, ComponentLibrary } from "./components";

/**
 * Standardized middleware user interface
 */
const middlewareUser = {
  /**
   * Tell middleware what we need - called first to determine readiness
   */
  initialize(runtime: FynModuleRuntime) {
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const config = basicCounterData?.config;

    console.debug(
      `📋 ${runtime.fynApp.name} initialize called with config:`,
      config
    );

    // We're a consumer
    return {
      status: "ready",
      mode: "consumer",
    };
  },

  /**
   * Main function - called when middleware is ready
   */
  async execute(runtime: FynModuleRuntime) {
    console.debug("MiddlewareUser.main called", {
      fynApp: runtime.fynApp.name,
    });
    console.debug(
      `Bootstrapping ${runtime.fynApp.name} with React ${React.version}`
    );

    // Find or create the div element to render into
    let targetDiv = document.getElementById("fynapp-2-react18");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-2-react18";
      document.body.appendChild(targetDiv);
    }

    // Load components from fynapp-x1
    let componentLibrary: ComponentLibrary;
    try {
      componentLibrary = await preloadComponents();
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

    // Get the basic counter middleware data to access config
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
      "🔍 fynapp-2-react18: Available middleware APIs:",
      Array.from(runtime.middlewareContext.keys())
    );
    console.debug("🔍 fynapp-2-react18: Middleware config:", middlewareConfig);

    // Render the React component with middleware config
    const root = ReactDomClient.createRoot(targetDiv);

    root.render(
      React.createElement(App, {
        appName: runtime.fynApp.name,
        components: componentLibrary,
        middlewareConfig,
        runtime, // Pass runtime for middleware context access
      })
    );
  },
};

// Export the middleware usage with standardized interface
// This app is a consumer - it consumes the basic counter config from the provider
export const main = useMiddleware(
  {
    info: {
      name: "basic-counter",
      provider: "fynapp-react-middleware",
      version: "^1.0.0",
    },
    config: "consume-only", // Consumer - uses config from provider
  },
  middlewareUser
);
