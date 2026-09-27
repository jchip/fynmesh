import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";

// Simple main module - the dashboard uses the ./component export pattern.
const main: FynUnit = {
  name: "fynapp-analytics",
  version: "1.0.0",
  framework: "react",

  initialize: async (_runtime: FynUnitRuntime) => {
    return { status: "ready", mode: "provider" };
  },

  execute: async (_runtime: FynUnitRuntime) => {
    return {
      type: "no-render" as const,
      framework: "react",
      version: "1.0.0",
      capabilities: [],
      message: "Analytics dashboard uses the ./component pattern for rendering",
    };
  },
};

export default main;
