import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import React from "react";
import ReactDOMClient from "react-dom/client";
import App from "./App";

/**
 * FynOps shell.
 *
 * Phase 0 placeholder: it renders into the host page's #fynops-root to prove
 * fynops.html boots the kernel and resolves React 19 from fynapp-react-19.
 * Routing, layout and session arrive in Phase 1 (notes/FYNOPS-DESIGN.md).
 */
class FynOpsShell implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(runtime: FynUnitRuntime) {
    let target = document.getElementById("fynops-root");
    if (!target) {
      target = document.createElement("div");
      target.id = "fynops-root";
      document.body.appendChild(target);
    }

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

export const main = new FynOpsShell();
