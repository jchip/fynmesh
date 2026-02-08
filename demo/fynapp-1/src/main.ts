import type { FynApp1Config } from "../../shared-demo-utils/fynapp-1-shared/types.ts";
import { createMain } from "../../shared-demo-utils/fynapp-1-shared/shared-main.ts";

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

export const main = createMain(config, {
  preloadComponents: async () => {
    const { preloadComponents } = await import("./components");
    return preloadComponents();
  },
  importApp: () => import("./App"),
});
