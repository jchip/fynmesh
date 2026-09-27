import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import type { FynOpsShellApi } from "fynops-shell/api";
import React from "react";
import ReactDOMClient from "react-dom/client";
import { ShipmentsView } from "./ShipmentsView";
import { injectStyles } from "./styles";

/**
 * FynOps shipments. Registers one view with the shell: the server-side grid in
 * the main outlet, and a shipment detail panel when mounted in the drawer.
 */
class OpsShipments implements FynUnit {
  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  execute(runtime: FynUnitRuntime) {
    const shell = runtime.middlewareContext.get("fynops-shell") as FynOpsShellApi | undefined;
    if (!shell) throw new Error("ops-shipments: fynops-shell middleware was not applied");

    shell.registerView({
      mount(el, props) {
        injectStyles();
        const root = ReactDOMClient.createRoot(el);
        root.render(React.createElement(ShipmentsView, { shell, props, runtime }));
        return () => root.unmount();
      },
    });

    return { type: "no-render" as const };
  }
}

export const main = new OpsShipments();
