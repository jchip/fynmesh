import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import React from "react";
import ReactDOMClient from "react-dom/client";
import App from "./App";

/**
 * React FynApp that consumes the `design-tokens` middleware provided by
 * `fynapp-design-tokens`. The consumer reads the middleware API from
 * `runtime.middlewareContext` and degrades gracefully if the provider
 * has not loaded yet.
 */
class DesignTokensConsumerUnit implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;

  initialize(_runtime: FynUnitRuntime) {
    // deferOk: we can render without the middleware and upgrade later.
    return { status: "ready", mode: "consumer", deferOk: true };
  }

  execute(runtime: FynUnitRuntime) {
    const id = runtime.fynApp.name;
    let target = document.getElementById(id);
    if (!target) {
      target = document.createElement("div");
      target.id = id;
      document.body.appendChild(target);
    }

    // The provider stores its API under the middleware name "design-tokens".
    // It may be absent if the provider FynApp isn't loaded - handle gracefully.
    const designTokens = runtime.middlewareContext.get("design-tokens");
    const api = designTokens?.api;
    if (!api) {
      console.warn(
        `${id}: design-tokens middleware not available; rendering with defaults.`
      );
    }

    const theme = api?.getTheme?.() ?? "(none)";

    if (!this.root) {
      this.root = ReactDOMClient.createRoot(target);
    }
    this.root.render(
      React.createElement(App, { appName: runtime.fynApp.name, theme })
    );
  }

  shutdown() {
    this.root?.unmount();
    this.root = undefined;
  }
}

export const main = useMiddleware(
  {
    // @ts-ignore - TS can't resolve module federation remote containers
    middleware: import(
      "fynapp-design-tokens/middleware/design-tokens/design-tokens",
      { with: { type: "fynapp-middleware" } }
    ),
    config: { theme: "fynmesh-default", cssCustomProperties: true },
  },
  new DesignTokensConsumerUnit()
);
