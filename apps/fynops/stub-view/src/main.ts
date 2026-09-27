import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import type { FynOpsShellApi } from "fynops-shell/api";
import React from "react";
import ReactDOMClient from "react-dom/client";
import StubView from "./App";

/**
 * Phase 1 stub. Registers a view through the fynops-shell middleware, the same
 * way every FynOps feature does, so the contract can be exercised before the
 * real features exist.
 */
class StubViewUnit implements FynUnit {
  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  execute(runtime: FynUnitRuntime) {
    const shell = runtime.middlewareContext.get("fynops-shell") as FynOpsShellApi | undefined;
    if (!shell) throw new Error("stub-view: fynops-shell middleware was not applied");

    shell.registerView({
      mount(el, props) {
        const root = ReactDOMClient.createRoot(el);
        root.render(React.createElement(StubView, { shell, props, runtime }));
        return () => root.unmount();
      },
    });

    return { type: "no-render" as const };
  }
}

export const main = new StubViewUnit();
