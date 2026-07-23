import type { FynApp1Config } from "../../shared-demo-utils/fynapp-1-shared/types.ts";
import { createMain } from "../../shared-demo-utils/fynapp-1-shared/shared-main.ts";
// Used by dynamic component imports
import "./components";

const config: FynApp1Config = {
  appName: "FynApp 1-B",
  targetId: "fynapp-1-b",
  theme: "fynmesh-green",
  middlewareRole: "consumer",
  spinnerColor: "#22c55e",
  deferOk: true,
  counterConfig: "consume-only",
  designTokensConfig: {
    theme: "fynmesh-green",
    cssCustomProperties: true,
    cssVariablePrefix: "fynmesh",
    enableThemeSwitching: true,
    global: false,
  },
  metadata: {
    name: "FynApp 1B",
    version: "1.0.0",
    description: "React 19 demo app variant B with green theme and components",
  },
};

export const main = createMain(config, {
  preloadComponents: async () => {
    const { preloadComponents } = await import("./components");
    return preloadComponents();
  },
  importApp: () => import("./App"),
});
