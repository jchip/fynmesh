import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import React from "react";
import ReactDOMClient from "react-dom/client";
import App from "./App";

/**
 * stub-ui: Phase 1 task A2 check. Renders a gallery of every fynops-ui-kit
 * component in both themes, with a theme toggle. Deleted in Wave C along
 * with the other Phase 1 stubs.
 */
class StubUi implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(runtime: FynUnitRuntime) {
    const target = document.createElement("div");
    target.id = "stub-ui-root";
    document.body.appendChild(target);

    this.root = ReactDOMClient.createRoot(target);
    this.root.render(React.createElement(App, { runtime }));

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

export const main = new StubUi();
