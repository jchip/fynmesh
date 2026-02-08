import App from "./App";
import { preloadComponents } from "./components";
import { createComponentExport } from "../../shared-demo-utils/fynapp-1-shared/shared-component.ts";
import type { FynApp1Config } from "../../shared-demo-utils/fynapp-1-shared/types.ts";

const config: Partial<FynApp1Config> = {
  appName: "FynApp 1",
  targetId: "fynapp-1",
  spinnerColor: "#3498db",
  metadata: {
    name: "FynApp 1",
    version: "1.0.0",
    description: "React 19 demo app with components",
  },
};

export const component = createComponentExport(
  config as FynApp1Config,
  App,
  preloadComponents
);
