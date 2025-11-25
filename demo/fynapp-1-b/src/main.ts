import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import type { ComponentFactoryResult, SelfManagedResult, NoRenderResult } from "fynapp-shell-mw/middleware/shell-layout";
// Used by dynamic component imports
import "./components";

/**
 * Standardized middleware user interface
 */
const middlewareUser = {
  /**
   * Tell middleware what we need - called first to determine readiness
   */
  initialize(runtime: FynUnitRuntime) {
    console.debug(
      `📋 ${runtime.fynApp.name} initialize called`
    );

    // We're a consumer
    return {
      status: "ready",
      mode: "consumer",
    };
  },

  /**
   * Main function - called when middleware is ready
   */
  async execute(runtime: FynUnitRuntime): Promise<ComponentFactoryResult | SelfManagedResult | NoRenderResult | void> {
    console.debug("🚀 FynApp 1-B initializing with middleware support");

    // Check if shell middleware is managing this execution
    const shellMiddleware = runtime.middlewareContext.get("shell-layout");
    const isShellManaged = shellMiddleware?.isShellManaged;
    
    console.debug(`🔍 ${runtime.fynApp.name} execute - Shell managed: ${isShellManaged}`);

    console.debug(
      "🔍 fynapp-1-b: Available middleware APIs:",
      Array.from(runtime.middlewareContext.keys())
    );

    // Load components from fynapp-x1
    let components;
    try {
      const { preloadComponents } = await import('./components');
      components = await preloadComponents();
      console.debug("✅ fynapp-1-b: Loaded components from fynapp-x1", Object.keys(components));
    } catch (error) {
      console.error("❌ fynapp-1-b: Failed to load components:", error);
      // Return error result
      const noRenderResult: NoRenderResult = {
        type: 'no-render',
        message: `Failed to load components: ${(error as Error).message}`,
        metadata: {
          framework: 'react',
          version: '19',
          capabilities: []
        }
      };
      return noRenderResult;
    }

    // Create a unified component that works in both modes
    const createAppComponent = async (React: any) => {
      const App = (await import('./App')).default;
      
      const AppWrapper = (props: any) => {
        return React.createElement(
          React.Suspense,
          { fallback: React.createElement('div', { style: { padding: '1rem' } }, 'Loading...') },
          React.createElement(App, {
            appName: runtime.fynApp.name,
            components,
            runtime,
            ...props
          })
        );
      };
      
      return AppWrapper;
    };

    if (isShellManaged) {
      // Shell middleware will handle execution - return component factory with full App
      console.debug(`🎭 ${runtime.fynApp.name} returning component factory for shell`);

      // Pre-create the AppComponent synchronously by loading it immediately
      const AppComponent = await createAppComponent((await import('react')).default);

      const result: ComponentFactoryResult = {
        type: 'component-factory',
        componentFactory: (React: any) => ({
          component: ({ fynAppName, runtime: shellRuntime, ...props }: any) => {
            return React.createElement(AppComponent, props);
          },
        }),
        metadata: {
          framework: 'react',
          version: '19',
          capabilities: ['component']
        }
      };

      return result;
    } else {
      // Standalone mode - render the same App component using our own React
      console.debug(`🚀 ${runtime.fynApp.name} executing in standalone mode`);
      
      const targetElement = document.getElementById('fynapp-1-b');
      if (targetElement) {
        try {
          // Dynamic import to avoid build issues
          const React = (await import('react')).default;
          const ReactDOM = (await import('react-dom/client')).default;
          
          // Use the same unified component
          const AppComponent = await createAppComponent(React);
          
          const root = ReactDOM.createRoot(targetElement);
          root.render(React.createElement(AppComponent));
          
          const result: SelfManagedResult = {
            type: 'self-managed',
            target: targetElement,
            cleanup: () => root.unmount?.(),
            metadata: {
              framework: 'react',
              version: '19',
              capabilities: ['self-managed']
            }
          };
          
          return result;
        } catch (error) {
          console.error('Failed to render in standalone mode:', error);
          const noRenderResult: NoRenderResult = {
            type: 'no-render',
            message: `Failed to render: ${(error as Error).message}`,
            metadata: {
              framework: 'react',
              version: '19',
              capabilities: []
            }
          };
          
          return noRenderResult;
        }
      }
      
      // No target element found
      const noRenderResult: NoRenderResult = {
        type: 'no-render',
        message: 'Target element #fynapp-1-b not found',
        metadata: {
          framework: 'react',
          version: '19',
          capabilities: []
        }
      };
      
      return noRenderResult;
    }
  },
};

// Export the middleware usage with standardized interface
export const main = useMiddleware(
  [
    {
      // @ts-ignore - TS can't understand module federation remote containers
      middleware: import('fynapp-react-middleware/main/basic-counter',
        { with: { type: "fynapp-middleware" } }),
      config: "consume-only", // Consumer - uses config from provider
    },
    {
      // @ts-ignore - TS can't understand module federation remote containers
      middleware: import('fynapp-design-tokens/middleware/design-tokens/design-tokens',
        { with: { type: "fynapp-middleware" } }),
      config: {
        theme: "fynmesh-green", // Start with a different theme
        cssCustomProperties: true,
        cssVariablePrefix: "fynmesh",
        enableThemeSwitching: true,
        global: false, // Use scoped themes per fynapp
      },
    },
  ],
  middlewareUser
);
