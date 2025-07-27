import { useMiddleware, FynModuleRuntime } from "@fynmesh/kernel";
// Used by dynamic component imports
import "./components";

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
   * Main function - called when middleware is ready (setup only, no DOM manipulation)
   */
  async execute(runtime: FynModuleRuntime) {
    console.debug("🚀 FynApp 1B initializing with middleware support");

    // Get the basic counter middleware data to access config
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
      "🔍 fynapp-1-b: Available middleware APIs:",
      Array.from(runtime.middlewareContext.keys())
    );
    console.debug("🔍 fynapp-1-b: Middleware config:", middlewareConfig);

    console.debug("✅ FynApp 1B initialization complete - ready for component rendering");
  },
};

// Export the middleware usage with standardized interface
// This app is a consumer - it consumes the basic counter config from the provider
export const main = useMiddleware(
  [
    {
      info: {
        name: "basic-counter",
        provider: "fynapp-react-middleware",
        version: "^1.0.0",
      },
      config: "consume-only", // Consumer - uses config from provider
    },
    {
      info: {
        name: "design-tokens",
        provider: "fynapp-design-tokens",
        version: "^1.0.0",
      },
      config: {
        theme: "fynmesh-green", // Start with a different theme
        cssCustomProperties: true,
        cssVariablePrefix: "fynmesh",
        enableThemeSwitching: true,
        global: false, // Use scoped themes per fynapp
      },
    },
  ],
  middlewareUser
);
