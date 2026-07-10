import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import React from "react";
import ReactDOMClient from "react-dom/client";
import App from "./App";

/**
 * Minimal standalone React FynApp.
 *
 * A FynUnit has three lifecycle hooks:
 *  - initialize: declare readiness (called first)
 *  - execute:    do the work (render) once ready
 *  - shutdown:   clean up when the FynApp is unloaded
 */
class ReactMinimalUnit implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready", mode: "standalone" };
  }

  execute(runtime: FynUnitRuntime) {
    // Find or create the container div to render into.
    const id = runtime.fynApp.name;
    let target = document.getElementById(id);
    if (!target) {
      target = document.createElement("div");
      target.id = id;
      document.body.appendChild(target);
    }

    if (!this.root) {
      this.root = ReactDOMClient.createRoot(target);
    }
    this.root.render(React.createElement(App, { appName: runtime.fynApp.name }));
  }

  shutdown() {
    this.root?.unmount();
    this.root = undefined;
  }
}

// No middleware for this example: pass an empty array.
export const main = useMiddleware([], new ReactMinimalUnit());
