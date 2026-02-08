/**
 * Shared main.ts logic for fynapp-1 variants.
 *
 * Both fynapp-1 and fynapp-1-b use this with different configs.
 * The actual module imports (App, components) are provided by each app
 * since they have different module federation setups.
 */
import type { FynUnitRuntime } from "@fynmesh/kernel";
import type { ComponentFactoryResult, SelfManagedResult, NoRenderResult } from "fynapp-shell-mw/middleware/shell-layout";
import { useMiddleware } from "@fynmesh/kernel";
import type { FynApp1Config } from "./types.ts";

interface AppImports {
  /** Dynamically imports and preloads components from fynapp-x1 */
  preloadComponents: () => Promise<any>;
  /** Dynamically imports the App component */
  importApp: () => Promise<{ default: any }>;
}

/**
 * Create a middleware user object parameterized by config.
 */
export function createMiddlewareUser(config: FynApp1Config, imports: AppImports) {
  return {
    initialize(runtime: FynUnitRuntime) {
      console.debug(
        `\u{1F4CB} ${runtime.fynApp.name} initialize called`
      );

      return {
        status: "ready" as const,
        mode: config.middlewareRole,
        ...(config.deferOk ? { deferOk: true } : {}),
      };
    },

    async execute(runtime: FynUnitRuntime): Promise<ComponentFactoryResult | SelfManagedResult | NoRenderResult | void> {
      console.debug(`\u{1F680} ${config.appName} initializing with middleware support`);

      const shellMiddleware = runtime.middlewareContext.get("shell-layout");
      const isShellManaged = shellMiddleware?.isShellManaged;

      console.debug(`\u{1F50D} ${runtime.fynApp.name} execute - Shell managed: ${isShellManaged}`);
      console.debug(
        `\u{1F50D} ${config.appName}: Available middleware APIs:`,
        Array.from(runtime.middlewareContext.keys())
      );

      // Load components from fynapp-x1
      let components;
      try {
        components = await imports.preloadComponents();
        console.debug(`\u2705 ${config.appName}: Loaded components from fynapp-x1`, Object.keys(components));
      } catch (error) {
        console.error(`\u274C ${config.appName}: Failed to load components:`, error);
        const noRenderResult: NoRenderResult = {
          type: "no-render",
          message: `Failed to load components: ${(error as Error).message}`,
          metadata: { framework: "react", version: "19", capabilities: [] },
        };
        return noRenderResult;
      }

      // Create a unified component that works in both modes
      const createAppComponent = async (React: any) => {
        const App = (await imports.importApp()).default;

        const AppWrapper = (props: any) => {
          return React.createElement(
            React.Suspense,
            { fallback: React.createElement("div", { style: { padding: "1rem" } }, "Loading...") },
            React.createElement(App, {
              appName: runtime.fynApp.name,
              components,
              runtime,
              ...props,
            })
          );
        };

        return AppWrapper;
      };

      if (isShellManaged) {
        console.debug(`\u{1F3AD} ${runtime.fynApp.name} returning component factory for shell`);

        const AppComponent = await createAppComponent((await import("react")).default);

        const result: ComponentFactoryResult = {
          type: "component-factory",
          componentFactory: (React: any) => ({
            component: ({ fynAppName, runtime: shellRuntime, ...props }: any) => {
              return React.createElement(AppComponent, props);
            },
          }),
          metadata: { framework: "react", version: "19", capabilities: ["component"] },
        };

        return result;
      } else {
        console.debug(`\u{1F680} ${runtime.fynApp.name} executing in standalone mode`);

        const targetElement = document.getElementById(config.targetId);
        if (targetElement) {
          try {
            const React = (await import("react")).default;
            const ReactDOM = (await import("react-dom/client")).default;

            const AppComponent = await createAppComponent(React);

            const root = ReactDOM.createRoot(targetElement);
            root.render(React.createElement(AppComponent));

            const result: SelfManagedResult = {
              type: "self-managed",
              target: targetElement,
              cleanup: () => root.unmount?.(),
              metadata: { framework: "react", version: "19", capabilities: ["self-managed"] },
            };

            return result;
          } catch (error) {
            console.error("Failed to render in standalone mode:", error);
            const noRenderResult: NoRenderResult = {
              type: "no-render",
              message: `Failed to render: ${(error as Error).message}`,
              metadata: { framework: "react", version: "19", capabilities: [] },
            };

            return noRenderResult;
          }
        }

        const noRenderResult: NoRenderResult = {
          type: "no-render",
          message: `Target element #${config.targetId} not found`,
          metadata: { framework: "react", version: "19", capabilities: [] },
        };

        return noRenderResult;
      }
    },
  };
}

/**
 * Create the full main export with middleware configuration.
 */
export function createMain(config: FynApp1Config, imports: AppImports) {
  const middlewareUser = createMiddlewareUser(config, imports);

  return useMiddleware(
    [
      {
        // @ts-ignore - TS can't understand module federation remote containers
        middleware: import(
          "fynapp-react-middleware/main/basic-counter",
          // @ts-ignore
          { with: { type: "fynapp-middleware" } }
        ),
        config: config.counterConfig,
      },
      {
        // @ts-ignore - TS can't understand module federation remote containers
        middleware: import(
          "fynapp-design-tokens/middleware/design-tokens/design-tokens",
          // @ts-ignore
          { with: { type: "fynapp-middleware" } }
        ),
        config: config.designTokensConfig,
      },
    ],
    middlewareUser
  );
}
