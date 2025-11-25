import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";

// Simple main module - sidebar uses ./component export pattern
const main: FynUnit = {
  name: "fynapp-sidebar",
  version: "1.0.0",
  framework: "react",

  initialize: async (runtime: FynUnitRuntime) => {
    console.debug("[fynapp-sidebar] initialize called");
    return { status: "ready", mode: "provider" };
  },

  execute: async (runtime: FynUnitRuntime) => {
    console.debug("[fynapp-sidebar] execute called - using component pattern");
    // Return no-render since we use the ./component expose pattern
    return {
      type: "no-render" as const,
      framework: "react",
      version: "1.0.0",
      capabilities: [],
      message: "Sidebar uses ./component pattern for rendering"
    };
  },
};

export default main;
