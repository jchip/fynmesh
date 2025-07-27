import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { preloadComponents, ComponentLibrary } from "./components";

// Component export for shell rendering
export const component = {
    type: 'react' as const,
    component: FynApp1BComponent,
    react: React,        // FynApp provides its React version
    reactDOM: ReactDOM,  // FynApp provides its ReactDOM version
    metadata: {
        name: 'FynApp 1B',
        version: '1.0.0',
        description: 'React 19 demo app variant B with green theme and components'
    }
};

// React component that will be rendered by the shell
function FynApp1BComponent({ fynApp, runtime }: any): React.ReactElement {
    const [componentLibrary, setComponentLibrary] = React.useState<ComponentLibrary | null>(null);
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
        return React.createElement('div', {
            style: { padding: '20px', textAlign: 'center' }
        }, [
            React.createElement('h2', { key: 'title' }, 'Loading components from fynapp-x1...'),
            React.createElement('div', {
                key: 'spinner',
                style: {
                    marginTop: '20px',
                    display: 'inline-block',
                    width: '50px',
                    height: '50px',
                    border: '5px solid #f3f3f3',
                    borderTop: '5px solid #22c55e',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }
            })
        ]);
    }

    if (error) {
        return React.createElement('div', {
            style: {
                padding: '20px',
                color: '#721c24',
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '4px'
            }
        }, [
            React.createElement('h3', { key: 'title' }, 'Error Loading Components'),
            React.createElement('p', { key: 'message' }, `Failed to load component library from fynapp-x1: ${error}`),
            React.createElement('button', {
                key: 'retry',
                onClick: () => window.location.reload()
            }, 'Retry')
        ]);
    }

    // Get middleware config
    const basicCounterData = runtime?.middlewareContext?.get("basic-counter");
    const middlewareConfig = basicCounterData?.config || { count: 0 };

    console.debug(
        "🔍 fynapp-1-b: Available middleware APIs:",
        Array.from(runtime?.middlewareContext?.keys() || [])
    );
    console.debug("🔍 fynapp-1-b: Middleware config:", middlewareConfig);

    // Render the main App component
    return React.createElement(App, {
        appName: fynApp?.name || 'fynapp-1-b',
        components: componentLibrary!, // Non-null assertion since we return early if null
        middlewareConfig,
        runtime
    });
}
