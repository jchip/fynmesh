/**
 * Shared component.ts logic for fynapp-1 variants.
 *
 * The component.ts provides the shell rendering component and metadata.
 * Parameterized by config for spinner color, metadata, etc.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import type { FynApp1Config } from "./types.ts";

/**
 * Create the component export for shell rendering, parameterized by config.
 */
export function createComponentExport(
  config: FynApp1Config,
  AppComponent: React.ComponentType<any>,
  preloadComponents: () => Promise<any>
) {
  function FynAppShellComponent({ fynApp, runtime }: any): React.ReactElement {
    const [componentLibrary, setComponentLibrary] =
      React.useState<any>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
      async function loadComponents() {
        try {
          console.debug("Loading component library from fynapp-x1...");
          const library = await preloadComponents();
          setComponentLibrary(library);
          console.debug("Successfully loaded component library from fynapp-x1");
        } catch (err) {
          console.error("Failed to load components from fynapp-x1:", err);
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      }

      loadComponents();
    }, []);

    if (loading) {
      return React.createElement(
        "div",
        { style: { padding: "20px", textAlign: "center" } },
        [
          React.createElement("h2", { key: "title" }, "Loading components from fynapp-x1..."),
          React.createElement("div", {
            key: "spinner",
            style: {
              marginTop: "20px",
              display: "inline-block",
              width: "50px",
              height: "50px",
              border: "5px solid #f3f3f3",
              borderTop: `5px solid ${config.spinnerColor}`,
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            },
          }),
        ]
      );
    }

    if (error) {
      return React.createElement(
        "div",
        {
          style: {
            padding: "20px",
            color: "#721c24",
            backgroundColor: "#f8d7da",
            border: "1px solid #f5c6cb",
            borderRadius: "4px",
          },
        },
        [
          React.createElement("h3", { key: "title" }, "Error Loading Components"),
          React.createElement(
            "p",
            { key: "message" },
            `Failed to load component library from fynapp-x1: ${error}`
          ),
          React.createElement(
            "button",
            { key: "retry", onClick: () => window.location.reload() },
            "Retry"
          ),
        ]
      );
    }

    // Get middleware config
    const basicCounterData = runtime?.middlewareContext?.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
      `\u{1F50D} ${config.appName}: Available middleware APIs:`,
      Array.from(runtime?.middlewareContext?.keys() || [])
    );
    console.debug(`\u{1F50D} ${config.appName}: Middleware config:`, middlewareConfig);

    return React.createElement(AppComponent, {
      appName: fynApp?.name || config.targetId,
      components: componentLibrary!,
      middlewareConfig,
      runtime,
    });
  }

  return {
    type: "react" as const,
    component: FynAppShellComponent,
    react: React,
    reactDOM: ReactDOM,
    metadata: config.metadata,
  };
}
