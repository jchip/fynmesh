import type { FynModuleRuntime } from "@fynmesh/kernel";
import { useMiddleware } from "@fynmesh/kernel";

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
   * Main function - called when middleware is ready (setup only, no DOM manipulation)
   */
  async execute(runtime: FynModuleRuntime) {
    console.debug("🚀 FynApp 1 initializing with middleware support");

    // Get the basic counter middleware data to access config
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
      "🔍 fynapp-1: Available middleware APIs:",
      Array.from(runtime.middlewareContext.keys())
    );
    console.debug("🔍 fynapp-1: Middleware config:", middlewareConfig);

    console.debug("✅ FynApp 1 initialization complete - ready for component rendering");
  },
};

// Export the middleware usage with standardized interface
export const main = useMiddleware(
  [
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
    {
      info: {
        name: "design-tokens",
        provider: "fynapp-design-tokens",
        version: "^1.0.0",
      },
      config: {
        theme: "fynmesh-default",
        cssCustomProperties: true,
        cssVariablePrefix: "fynmesh",
        enableThemeSwitching: true,
        global: false, // Use scoped themes per fynapp
      },
    },
  ],
  middlewareUser
);
