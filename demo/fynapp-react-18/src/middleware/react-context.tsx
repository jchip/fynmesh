// @ts-ignore
import React, { createContext, useContext, useState, ReactNode } from 'esm-react';
import { FynAppMiddleware, FynApp, MiddlewareContext } from '@fynmesh/kernel';

// Define the shape of our context state
export interface AppContextState {
    theme: 'light' | 'dark';
    user: {
        isAuthenticated: boolean;
        username: string | null;
    };
}

// Define the actions/methods our context will provide
export interface AppContextActions {
    toggleTheme: () => void;
    login: (username: string) => void;
    logout: () => void;
}

// Combine state and actions for the full context type
export interface AppContextValue extends AppContextState, AppContextActions { }

// Configuration interface for this middleware
export interface ThemeConfig {
    defaultTheme?: 'light' | 'dark';
    themes?: Record<string, any>;
}

// Initial state for our context
const initialState: AppContextState = {
    theme: 'light',
    user: {
        isAuthenticated: false,
        username: null,
    },
};

// Create the context with an undefined default value
export const AppContext = createContext<AppContextValue | undefined>(undefined);

// Provider component that wraps app and makes context available
export function AppContextProvider({ children, initialTheme = 'light' }: { 
    children: ReactNode;
    initialTheme?: 'light' | 'dark';
}) {
    const [state, setState] = useState<AppContextState>({
        ...initialState,
        theme: initialTheme
    });

    // Define our actions
    const toggleTheme = () => {
        setState((prevState: AppContextState) => ({
            ...prevState,
            theme: prevState.theme === 'light' ? 'dark' : 'light',
        }));
    };

    const login = (username: string) => {
        setState((prevState: AppContextState) => ({
            ...prevState,
            user: {
                isAuthenticated: true,
                username,
            },
        }));
    };

    const logout = () => {
        setState((prevState: AppContextState) => ({
            ...prevState,
            user: {
                isAuthenticated: false,
                username: null,
            },
        }));
    };

    // Combine state and actions to create the context value
    const value: AppContextValue = {
        ...state,
        toggleTheme,
        login,
        logout,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Custom hook for consuming the context
export function useAppContext(): AppContextValue {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppContextProvider');
    }
    return context;
}

/**
 * React Context Middleware Implementation
 * Provides React context functionality to FynApps
 */
class ReactContextMiddleware implements FynAppMiddleware {
    name = 'react-context';
    version = '1.0.0';
    
    private contexts = new WeakMap<FynApp, React.Context<any>>();

    async setup(kernel: any) {
        console.log('React Context Middleware initialized');
    }

    /**
     * Apply the middleware to the FynApp by wrapping its main component with context provider
     */
    async apply(fynApp: FynApp, context: MiddlewareContext) {
        const config = context.config as ThemeConfig;
        const defaultTheme = config.defaultTheme || 'light';
        
        console.log('Applying react-context middleware to', fynApp.name, 'with theme:', defaultTheme);

        // Store the context for this FynApp
        this.contexts.set(fynApp, AppContext);

        // Wrap the FynApp's main component if it exists
        if (fynApp.mainModule && fynApp.mainModule.App) {
            const OriginalApp = fynApp.mainModule.App;
            
            // Create a wrapped version that includes the context provider
            fynApp.mainModule.App = (props: any) => {
                return React.createElement(AppContextProvider, 
                    { initialTheme: defaultTheme },
                    React.createElement(OriginalApp, props)
                );
            };
            
            console.log('Wrapped', fynApp.name, 'App component with theme context');
        }

        // Expose context API to the FynApp
        fynApp.middleware = fynApp.middleware || {};
        fynApp.middleware['react-context'] = {
            getContext: () => this.contexts.get(fynApp),
            useAppContext: useAppContext,
            AppContext: AppContext,
            AppContextProvider: AppContextProvider
        };
        
        console.log('Exposed react-context APIs to', fynApp.name);
    }
}

/**
 * Export middleware for federation loading
 * The kernel will look for exports that start with __middleware__
 */
export const __middleware__ReactContext = new ReactContextMiddleware();
