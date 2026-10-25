/**
 * A FynApp's `src/main.ts`: a FynUnit that uses a middleware from another
 * FynApp (see the README's "Using Middleware").
 */
import { useMiddleware, type FynUnit, type FynUnitRuntime } from "@fynmesh/kernel";

const unit: FynUnit = {
  initialize(runtime: FynUnitRuntime) {
    return { status: "ready" };
  },

  execute(runtime: FynUnitRuntime) {
    // The middleware's apply() put its API here
    const tokens = runtime.middlewareContext.get("design-tokens");
    console.log(`${runtime.fynApp.name} theme:`, tokens?.theme);

    // Messaging, when the bus add-on is installed
    runtime.bus?.on("host.ready", (payload) => console.log("host ready", payload));
  },

  shutdown(runtime: FynUnitRuntime) {
    console.log(`${runtime.fynApp.name} shutting down`);
  },
};

export const main = useMiddleware(
  {
    mw: import("fynapp-design-tokens/middleware/design-tokens/design-tokens", {
      with: { type: "fynapp-middleware" },
    }),
    config: { theme: "fynmesh-default", cssCustomProperties: true },
  },
  unit,
);
