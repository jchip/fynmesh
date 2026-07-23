import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import React from "react";
import ReactDOMClient from "react-dom/client";
import App from "./App";

// Inline result types to avoid fynapp-shell-mw dependency
interface SelfManagedResult {
  type: "self-managed";
  target: HTMLElement;
  cleanup?: () => void;
  metadata?: Record<string, unknown>;
}

interface ComponentFactoryResult {
  type: "component-factory";
  componentFactory: (React: unknown) => { component: unknown; props: unknown };
  metadata?: Record<string, unknown>;
}

/**
 * FynUnit implementation for fynapp-notes
 */
class NotesUnit implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;

  /**
   * Initialize - called first to determine readiness
   */
  initialize(runtime: FynUnitRuntime) {
    console.log(`📋 ${runtime.fynApp.name} initialize called`);
    return {
      status: "ready" as const,
      mode: "standalone" as const,
    };
  }

  /**
   * Execute - called when middleware is ready, renders the app
   */
  async execute(
    runtime: FynUnitRuntime
  ): Promise<SelfManagedResult | ComponentFactoryResult> {
    console.log(`🚀 ${runtime.fynApp.name} executing`);

    // Check if shell middleware is managing this execution
    const shellMiddleware = runtime.middlewareContext.get("shell-layout");
    const isShellManaged = shellMiddleware?.isShellManaged;

    if (isShellManaged) {
      // Shell-managed mode: return a component factory
      console.debug(
        `🎭 ${runtime.fynApp.name} returning component factory for shell`
      );

      return {
        type: "component-factory",
        componentFactory: (React: any) => ({
          component: (props: any) =>
            React.createElement(App, {
              appName: runtime.fynApp.name,
              runtime,
              ...props,
            }),
          props: {},
        }),
        metadata: {
          framework: "react",
          version: React.version,
          capabilities: ["component"],
        },
      };
    }

    // Standalone mode: render directly
    console.debug(`🚀 ${runtime.fynApp.name} rendering in standalone mode`);

    // Find or create target element
    let targetElement = document.getElementById("fynapp-notes");
    if (!targetElement) {
      targetElement = document.createElement("div");
      targetElement.id = "fynapp-notes";
      document.body.appendChild(targetElement);
    }

    // Create React root and render
    this.root = ReactDOMClient.createRoot(targetElement);
    this.root.render(
      React.createElement(App, {
        appName: runtime.fynApp.name,
        runtime,
      })
    );

    return {
      type: "self-managed",
      target: targetElement,
      cleanup: () => this.shutdown(),
      metadata: {
        framework: "react",
        version: React.version,
        capabilities: ["self-managed"],
      },
    };
  }

  /**
   * Shutdown - cleanup when FynApp is unloaded
   */
  shutdown(): void {
    console.debug(`🛑 fynapp-notes shutting down`);
    this.root?.unmount();
    this.root = undefined;
  }
}

// Export the main entry point - no middleware needed for this simple app
export const main = useMiddleware([], new NotesUnit());
