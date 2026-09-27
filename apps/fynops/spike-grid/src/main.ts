import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import React from "react";
import ReactDOMClient from "react-dom/client";
import App from "./App";

/**
 * Phase 0 spike: AG Grid enterprise row grouping, with enterprise shared by
 * fynops-grid-lib on top of the community grid fynapp-ag-grid-lib shares.
 * Load with fynops.html?load=fynapp-ag-grid-lib,fynops-grid-lib,spike-grid
 */
class SpikeGrid implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(_runtime: FynUnitRuntime) {
    const target = document.createElement("div");
    target.id = "spike-grid";
    document.body.appendChild(target);

    this.root = ReactDOMClient.createRoot(target);
    this.root.render(React.createElement(App));

    return {
      type: "self-managed" as const,
      target,
      cleanup: () => this.shutdown(),
      metadata: { framework: "react", version: React.version, capabilities: ["self-managed"] },
    };
  }

  shutdown(): void {
    this.root?.unmount();
    this.root = undefined;
  }
}

export const main = new SpikeGrid();
