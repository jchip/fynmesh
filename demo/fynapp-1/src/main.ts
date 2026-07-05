import type { FynUnitRuntime } from "@fynmesh/kernel";
import type { FynApp1Config } from "../../shared-demo-utils/fynapp-1-shared/types.ts";
import { createMain } from "../../shared-demo-utils/fynapp-1-shared/shared-main.ts";
import { GET_STATUS_TOPIC } from "../../shared-demo-utils/fynbus-hooks.ts";

const config: FynApp1Config = {
  appName: "FynApp 1",
  targetId: "fynapp-1",
  theme: "fynmesh-dark",
  middlewareRole: "provider",
  spinnerColor: "#3498db",
  counterConfig: {
    share: true,
    count: 10,
  },
  designTokensConfig: {
    theme: "fynmesh-default",
    cssCustomProperties: true,
    cssVariablePrefix: "fynmesh",
    enableThemeSwitching: true,
    global: false,
  },
  metadata: {
    name: "FynApp 1",
    version: "1.0.0",
    description: "React 19 demo app with components",
  },
};

// FynBus demo (FYM-18): this app is THE responder for "get-status".
// handle() throws on duplicate registration, so guard against execute
// being called more than once.
let statusHandlerRegistered = false;

export const main = createMain(config, {
  preloadComponents: async () => {
    const { preloadComponents } = await import("./components");
    return preloadComponents();
  },
  importApp: () => import("./App"),
  setupBus: (runtime: FynUnitRuntime) => {
    if (!runtime.bus || statusHandlerRegistered) {
      return;
    }
    statusHandlerRegistered = true;
    runtime.bus.handle(GET_STATUS_TOPIC, () => ({
      app: runtime.fynApp.name,
      time: new Date().toISOString(),
    }));
    console.debug(
      `\u{1F68C} ${runtime.fynApp.name}: FynBus handler registered for "${GET_STATUS_TOPIC}"`
    );
  },
});
