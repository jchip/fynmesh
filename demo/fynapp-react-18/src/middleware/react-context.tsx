// @ts-ignore
import React, { createContext, useContext, useState, ReactNode } from 'esm-react';

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
export function AppContextProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AppContextState>(initialState);

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
 * When the kernel loads a module that is supposed to contain a middleware, the kernel will
 * look for exports that are named "__middleware__<middleware-name>".
 *
 * This is a simple middleware that will add a React context provider to the FynApp.
 */
export const __middleware__ReactContext = {
    name: "react-context",
    async setup(kernel: any) {
        //
    },
    /**
     * Apply the middleware to the FynApp.
     * @param fynApp The FynApp to apply the middleware to.
     */
    async apply(fynApp: any) {
        console.log("react-context middleware");
    }
}