import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";

// Simple main module - AG Grid uses ./component export pattern
const main: FynUnit = {
  name: "fynapp-ag-grid",
  version: "1.0.0",
  framework: "react",

  initialize: async (runtime: FynUnitRuntime) => {
    console.log(`🗃️ ${runtime.fynApp.name}: Initializing AG Grid FynApp`);
    return { status: "ready", mode: "provider" };
  },

  execute: async (runtime: FynUnitRuntime) => {
    console.log(`🗃️ ${runtime.fynApp.name}: Execute - using component pattern`);
    // Return no-render since we use the ./component expose pattern
    return {
      type: "no-render" as const,
      framework: "react",
      version: "1.0.0",
      capabilities: [],
      message: "AG Grid uses ./component pattern for rendering"
    };
  },
};

export default main;
