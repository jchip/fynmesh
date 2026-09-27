import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import type { FynOpsShellApi } from "fynops-shell/api";
import React from "react";
import ReactDOMClient from "react-dom/client";
import MapView from "./MapView";

/**
 * ops-map: registers a view through the fynops-shell middleware. mount(el,
 * props) renders the fleet map into el and returns its unmount function; it
 * may run twice (main and drawer), though this feature only expects "main".
 */
class OpsMapUnit implements FynUnit {
  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  execute(runtime: FynUnitRuntime) {
    const shell = runtime.middlewareContext.get("fynops-shell") as FynOpsShellApi | undefined;
    if (!shell) throw new Error("ops-map: fynops-shell middleware was not applied");

    shell.registerView({
      mount(el, props) {
        const root = ReactDOMClient.createRoot(el);
        root.render(React.createElement(MapView, { shell, props, runtime }));
        return () => root.unmount();
      },
    });

    return { type: "no-render" as const };
  }
}

export const main = new OpsMapUnit();
