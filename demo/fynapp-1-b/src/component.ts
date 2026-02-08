import App from "./App";
import { preloadComponents } from "./components";
import { createComponentExport } from "../../shared-demo-utils/fynapp-1-shared/shared-component.ts";
import type { FynApp1Config } from "../../shared-demo-utils/fynapp-1-shared/types.ts";

const config: Partial<FynApp1Config> = {
  appName: "FynApp 1B",
  targetId: "fynapp-1-b",
  spinnerColor: "#22c55e",
  metadata: {
    name: "FynApp 1B",
    version: "1.0.0",
    description: "React 19 demo app variant B with green theme and components",
  },
};

export const component = createComponentExport(
  config as FynApp1Config,
  App,
  preloadComponents
);
