import { useMiddleware, FynModuleRuntime, ComponentFactoryResult, SelfManagedResult, NoRenderResult, ComponentProps } from "@fynmesh/kernel";
// Used by dynamic component imports
import "./components";

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

    // We're a consumer
    return {
      status: "ready",
      mode: "consumer",
    };
  },

  /**
   * Main function - called when middleware is ready
   */
  async execute(runtime: FynModuleRuntime): Promise<ComponentFactoryResult | SelfManagedResult | NoRenderResult | void> {
    console.debug("🚀 FynApp 1B initializing with middleware support");

    // Check if shell middleware is managing this execution
    const shellMiddleware = runtime.middlewareContext.get("shell-layout");
    const isShellManaged = shellMiddleware?.isShellManaged;
    
    console.debug(`🔍 ${runtime.fynApp.name} execute - Shell managed: ${isShellManaged}`);

    // Get the basic counter middleware data to access config
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
      "🔍 fynapp-1-b: Available middleware APIs:",
      Array.from(runtime.middlewareContext.keys())
    );
    console.debug("🔍 fynapp-1-b: Middleware config:", middlewareConfig);

    if (isShellManaged) {
      // Shell middleware will handle execution - return component factory
      console.debug(`🎭 ${runtime.fynApp.name} returning component factory for shell`);
      
      const result: ComponentFactoryResult = {
        type: 'component-factory',
        componentFactory: (React: any) => ({
          component: ({ fynAppName, runtime: shellRuntime, ...props }: ComponentProps) => {
            return React.createElement('div', {
              style: { padding: '1rem', border: '2px solid #10b981', borderRadius: '8px', margin: '1rem' }
            }, [
              React.createElement('h3', { key: 'title', style: { margin: '0 0 1rem 0', color: '#10b981' } }, `🚀 ${fynAppName} (Shell Managed)`),
              React.createElement('p', { key: 'desc', style: { margin: '0 0 0.5rem 0', fontSize: '0.875rem' } }, 
                `This FynApp-1B is being rendered by the shell middleware using React ${React.version}.`),
              React.createElement('p', { key: 'mode', style: { margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontStyle: 'italic' } }, 
                'Mode: Consumer (uses shared counter config)'),
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
      
      const targetElement = document.getElementById('fynapp-1-b');
      if (targetElement) {
        try {
          // Dynamic import to avoid build issues
          const React = (await import('react')).default;
          const ReactDOM = (await import('react-dom/client')).default;
          
          // Create a simple component for standalone mode
          const StandaloneApp = () => {
            return React.createElement('div', {
              style: { padding: '1rem', border: '2px solid #8b5cf6', borderRadius: '8px' }
            }, [
              React.createElement('h3', { key: 'title', style: { margin: '0 0 1rem 0', color: '#8b5cf6' } }, '🚀 FynApp 1-B (Standalone)'),
              React.createElement('p', { key: 'desc', style: { margin: '0 0 0.5rem 0', fontSize: '0.875rem' } }, 
                'This FynApp-1B is running in standalone mode with its own React DOM rendering.'),
              React.createElement('p', { key: 'mode', style: { margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontStyle: 'italic' } }, 
                'Mode: Consumer (uses shared counter config)'),
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
// This app is a consumer - it consumes the basic counter config from the provider
export const main = useMiddleware(
  [
    {
      info: {
        name: "basic-counter",
        provider: "fynapp-react-middleware",
        version: "^1.0.0",
      },
      config: "consume-only", // Consumer - uses config from provider
    },
    {
      info: {
        name: "design-tokens",
        provider: "fynapp-design-tokens",
        version: "^1.0.0",
      },
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
