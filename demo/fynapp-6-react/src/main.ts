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
      contextId: "counter", // Need counter context
      isolationLevel: "primary", // We are the primary provider
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

    // Get middleware APIs if available
    const reactContextAPI = runtime.middlewareContext.get("react-context");
    const sharedSymbols = runtime.middlewareContext.get(
      "react-context:shared-symbols"
    );

    const counterSymbol = sharedSymbols?.counter;
    const counterSharedProvider = counterSymbol
      ? reactContextAPI?.getSharedProvider(counterSymbol)
      : undefined;
    const useCounterContext = reactContextAPI?.counter?.useContext;

    // Create wrapper component that uses shared provider if available
    const AppWithContext = () => {
      if (counterSharedProvider && useCounterContext) {
        console.log(
          "✅ fynapp-6-react: Using shared Provider via symbol for counter context"
        );
        return React.createElement(
          counterSharedProvider,
          {},
          React.createElement(App, {
            appName: runtime.fynApp.name,
            useCounterContext,
          })
        );
      } else {
        console.warn(
          "⚠️ fynapp-6-react: Shared Provider not available, using standalone mode"
        );
        return React.createElement(App, {
          appName: runtime.fynApp.name,
          useCounterContext: undefined,
        });
      }
    };

    // Render the React component with context
    ReactDomClient.createRoot(targetDiv).render(
      React.createElement(AppWithContext)
    );

    console.log(`${runtime.fynApp.name} bootstrapped successfully`);
  }
}

// Export the middleware usage with standardized interface
// This app is a primary provider - it creates and shares contexts
export const main = useMiddleware(
  {
    info: {
      name: "react-context",
      provider: "fynapp-react-middleware",
      version: "^1.0.0",
    },
    config: "primary", // Primary provider - creates and shares contexts
    requireReady: true, // Wait for middleware to be ready before invoking
  },
  new MiddlewareUser()
);
