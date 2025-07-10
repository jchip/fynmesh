import { useMiddleware, FynModuleRuntime } from "@fynmesh/kernel";
import React from "react";
import ReactDomClient from "react-dom/client";
// Used by dynamic component imports
import "./components";
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

    // We're a primary provider
    return {
      status: "ready",
      mode: "provider",
    };
  },

  /**
   * Main function - called when middleware is ready
   */
  async execute(runtime: FynModuleRuntime) {
    // Create a loading indicator
    const createLoadingIndicator = () => {
      const loadingDiv = document.createElement("div");
      loadingDiv.id = "fynapp-1-loading";
      loadingDiv.style.padding = "20px";
      loadingDiv.style.textAlign = "center";
      loadingDiv.innerHTML = `
            <h2>Loading components from fynapp-x1...</h2>
            <div style="margin-top: 20px; display: inline-block;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3;
                            border-top: 5px solid #3498db; border-radius: 50%;
                            animation: spin 1s linear infinite;"></div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
      return loadingDiv;
    };

    // Find or create the div element to render into
    let targetDiv = document.getElementById("fynapp-1");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-1";
      document.body.appendChild(targetDiv);
    }

    // Show loading indicator
    const loadingIndicator = createLoadingIndicator();
    targetDiv.appendChild(loadingIndicator);

    // Pre-load components from fynapp-x1
    let componentLibrary: ComponentLibrary;

    try {
      // Load the actual components
      componentLibrary = await preloadComponents();
      console.debug("Successfully loaded component library from fynapp-x1");
    } catch (error) {
      console.error("Failed to load components from fynapp-x1:", error);

      // Show error message
      targetDiv.innerHTML = `
            <div style="padding: 20px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
                <h3>Error Loading Components</h3>
                <p>Failed to load component library from fynapp-x1. Check console for details.</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
      return; // Exit early
    } finally {
      // Remove loading indicator
      if (loadingIndicator.parentNode) {
        loadingIndicator.parentNode.removeChild(loadingIndicator);
      }
    }

    // Get the basic counter middleware data to access config
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
      "🔍 fynapp-1: Available middleware APIs:",
      Array.from(runtime.middlewareContext.keys())
    );
    console.debug("🔍 fynapp-1: Middleware config:", middlewareConfig);

    // Render the React component with pre-loaded components and middleware config
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
export const main = useMiddleware(
  {
    info: {
      name: "basic-counter",
      provider: "fynapp-react-middleware",
      version: "^1.0.0",
    },
    config: {
      count: 10,
    },
  },
  middlewareUser
);
