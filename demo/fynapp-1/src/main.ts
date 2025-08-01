import type { FynModuleRuntime, ComponentFactoryResult, SelfManagedResult, NoRenderResult, ComponentProps } from "@fynmesh/kernel";
import { useMiddleware } from "@fynmesh/kernel";

/**
 * Standardized middleware user interface
 */
const middlewareUser = {
  /**
   * Tell middleware what we need - called first to determine readiness
   */
  initialize(runtime: FynModuleRuntime) {
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const config = basicCounterData?.config;

    console.debug(
      `📋 ${runtime.fynApp.name} initialize called with config:`,
      config
    );

    // We're a primary provider
    return {
      status: "ready",
      mode: "provider",
    };
  },

  /**
   * Main function - called when middleware is ready
   */
  async execute(runtime: FynModuleRuntime): Promise<ComponentFactoryResult | SelfManagedResult | NoRenderResult | void> {
    console.debug("🚀 FynApp 1 initializing with middleware support");

    // Check if shell middleware is managing this execution
    const shellMiddleware = runtime.middlewareContext.get("shell-layout");
    const isShellManaged = shellMiddleware?.isShellManaged;
    
    console.debug(`🔍 ${runtime.fynApp.name} execute - Shell managed: ${isShellManaged}`);

    // Get the basic counter middleware data to access config
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
      "🔍 fynapp-1: Available middleware APIs:",
      Array.from(runtime.middlewareContext.keys())
    );
    console.debug("🔍 fynapp-1: Middleware config:", middlewareConfig);

    if (isShellManaged) {
      // Shell middleware will handle execution - return component factory
      console.debug(`🎭 ${runtime.fynApp.name} returning component factory for shell`);
      
      const result: ComponentFactoryResult = {
        type: 'component-factory',
        componentFactory: (React: any) => ({
          component: ({ fynAppName, runtime: shellRuntime, ...props }: ComponentProps) => {
            // Import App component dynamically to avoid bundling issues
            return React.createElement('div', {
              style: { padding: '1rem', border: '2px solid #3b82f6', borderRadius: '8px', margin: '1rem' }
            }, [
              React.createElement('h3', { key: 'title', style: { margin: '0 0 1rem 0', color: '#3b82f6' } }, `🚀 ${fynAppName} (Shell Managed)`),
              React.createElement('p', { key: 'desc', style: { margin: '0 0 0.5rem 0', fontSize: '0.875rem' } }, 
                `This FynApp is being rendered by the shell middleware using React ${React.version}.`),
              React.createElement('p', { key: 'config', style: { margin: '0', fontSize: '0.875rem', color: '#6b7280' } }, 
                `Middleware config: count = ${middlewareConfig.count}`),
            ]);
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
      // Standalone mode - try to use original ReactDOM.render pattern
      console.debug(`🚀 ${runtime.fynApp.name} executing in standalone mode`);
      
      const targetElement = document.getElementById('fynapp-1');
      if (targetElement) {
        try {
          // Dynamic import to avoid build issues
          const React = (await import('react')).default;
          const ReactDOM = (await import('react-dom/client')).default;
          
          // Create a simple component for standalone mode
          const StandaloneApp = () => {
            return React.createElement('div', {
              style: { padding: '1rem', border: '2px solid #10b981', borderRadius: '8px' }
            }, [
              React.createElement('h3', { key: 'title', style: { margin: '0 0 1rem 0', color: '#10b981' } }, '🚀 FynApp 1 (Standalone)'),
              React.createElement('p', { key: 'desc', style: { margin: '0 0 0.5rem 0', fontSize: '0.875rem' } }, 
                'This FynApp is running in standalone mode with its own React DOM rendering.'),
              React.createElement('p', { key: 'config', style: { margin: '0', fontSize: '0.875rem', color: '#6b7280' } }, 
                `Middleware config: count = ${middlewareConfig.count}`),
            ]);
          };
          
          const root = ReactDOM.createRoot(targetElement);
          root.render(React.createElement(StandaloneApp));
          
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
            message: `Failed to render: ${error.message}`,
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
        message: 'Target element #fynapp-1 not found',
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
      info: {
        name: "basic-counter",
        provider: "fynapp-react-middleware",
        version: "^1.0.0",
      },
      config: {
        count: 10,
      },
    },
    {
      info: {
        name: "design-tokens",
        provider: "fynapp-design-tokens",
        version: "^1.0.0",
      },
      config: {
        theme: "fynmesh-default",
        cssCustomProperties: true,
        cssVariablePrefix: "fynmesh",
        enableThemeSwitching: true,
        global: false, // Use scoped themes per fynapp
      },
    },
  ],
  middlewareUser
);
