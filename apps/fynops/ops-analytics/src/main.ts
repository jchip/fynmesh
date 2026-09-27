import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import type { FynOpsShellApi } from "fynops-shell/api";
import React from "react";
import ReactDOMClient from "react-dom/client";
import { AnalyticsView } from "./AnalyticsView";
import { injectStyles } from "./styles";

/**
 * FynOps analytics. Registers one read-only view with the shell: KPI tiles
 * plus four echarts charts, fed by fynopsData.analytics.* and the vehicle
 * position bus. No selection, no drawer.
 */
class OpsAnalytics implements FynUnit {
  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  execute(runtime: FynUnitRuntime) {
    const shell = runtime.middlewareContext.get("fynops-shell") as FynOpsShellApi | undefined;
    if (!shell) throw new Error("ops-analytics: fynops-shell middleware was not applied");

    shell.registerView({
      mount(el) {
        injectStyles();
        const root = ReactDOMClient.createRoot(el);
        root.render(React.createElement(AnalyticsView, { runtime }));
        return () => root.unmount();
      },
    });

    return { type: "no-render" as const };
  }
}

export const main = new OpsAnalytics();
