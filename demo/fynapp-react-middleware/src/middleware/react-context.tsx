// @ts-ignore
import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'esm-react';

import type { FynApp, FynAppMiddleware, MiddlewareContext } from "@fynmesh/kernel";


// =============================================================================
// Type Definitions
// =============================================================================

export interface ContextConfig<T = any> {
  contextName: string;
  initialState: T;
  actions?: Record<string, any>; // Allow both function and object formats
  persistence?: {
    key?: string;
    type?: 'localStorage' | 'sessionStorage' | 'memory';
    storage?: 'localStorage' | 'sessionStorage' | 'memory'; // Legacy support
  };
  shared?: boolean; // Share across FynApps or isolate per app
  middleware?: {
    onStateChange?: (oldState: T, newState: T, action: string) => void;
    validation?: (state: T) => boolean;
  };
}

export interface ContextValue<T = any> {
  state: T;
  actions: Record<string, (...args: any[]) => void>;
  setState: (updater: Partial<T> | ((prevState: T) => Partial<T>)) => void;
}

export interface ReactContextMiddlewareConfig {
  contexts: ContextConfig[];
}

// =============================================================================
// Context Provider Component
// =============================================================================

function createContextProvider<T>(config: ContextConfig<T>) {
  const Context = createContext<ContextValue<T> | undefined>(undefined);

  function Provider({ children, fynAppId }: { children: ReactNode; fynAppId?: string }) {
    // Load initial state from persistence
    const getInitialState = useCallback((): T => {
      if (config.persistence) {
        try {
          const key = fynAppId ? `${config.persistence.key}-${fynAppId}` : config.persistence.key!;
          
          switch (config.persistence.storage) {
            case 'localStorage':
              if (typeof window !== 'undefined' && window.localStorage) {
                const stored = localStorage.getItem(key);
                if (stored) {
                  return { ...config.initialState, ...JSON.parse(stored) };
                }
              }
              break;
            case 'sessionStorage':
              if (typeof window !== 'undefined' && window.sessionStorage) {
                const stored = sessionStorage.getItem(key);
                if (stored) {
                  return { ...config.initialState, ...JSON.parse(stored) };
                }
              }
              break;
            case 'memory':
              // Memory storage would be handled at middleware level
              break;
          }
        } catch (error) {
          console.warn(`Failed to load persisted state for ${config.contextName}:`, error);
        }
      }
      return config.initialState;
    }, [fynAppId]);

    const [state, setState] = useState<T>(getInitialState);
    const prevStateRef = useRef<T>(state);

    // Persist state changes
    useEffect(() => {
      if (config.persistence && prevStateRef.current !== state) {
        try {
          const key = fynAppId ? `${config.persistence.key}-${fynAppId}` : config.persistence.key!;
          
          switch (config.persistence.storage) {
            case 'localStorage':
              if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem(key, JSON.stringify(state));
              }
              break;
            case 'sessionStorage':
              if (typeof window !== 'undefined' && window.sessionStorage) {
                sessionStorage.setItem(key, JSON.stringify(state));
              }
              break;
          }
        } catch (error) {
          console.warn(`Failed to persist state for ${config.contextName}:`, error);
        }
      }
      prevStateRef.current = state;
    }, [state, fynAppId]);

    // Create actions
    const actions = useCallback(() => {
      if (!config.actions) return {};

      const actionMap: Record<string, (...args: any[]) => void> = {};

      Object.entries(config.actions).forEach(([actionName, actionDef]) => {
        actionMap[actionName] = (...args: any[]) => {
          setState((prevState: T) => {
            // Handle both old and new action formats
            let actionFn: any;
            let validator: any = null;
            
            if (typeof actionDef === 'function') {
              // Legacy format: direct function
              actionFn = actionDef;
            } else if (actionDef && typeof actionDef === 'object' && actionDef.reducer) {
              // New format: { validator, reducer }
              actionFn = actionDef.reducer;
              validator = actionDef.validator;
            } else {
              console.warn(`Invalid action definition for ${actionName}`);
              return prevState;
            }
            
            // Validate if validator exists
            if (validator && !validator(prevState, ...args)) {
              console.warn(`Validation failed for action ${actionName} with args:`, args);
              return prevState;
            }

            // Validate current state if validator provided
            if (config.middleware?.validation && !config.middleware.validation(prevState)) {
              console.warn(`State validation failed for ${config.contextName}`);
              return prevState;
            }

            const result = actionFn(prevState, ...args);
            const newState = typeof result === 'function' 
              ? { ...prevState, ...result(prevState) }
              : { ...prevState, ...result };

            // Call middleware hook
            if (config.middleware?.onStateChange) {
              config.middleware.onStateChange(prevState, newState, actionName);
            }

            return newState;
          });
        };
      });

      return actionMap;
    }, []);

         // Generic setState function
     const setStateGeneric = useCallback((updater: Partial<T> | ((prevState: T) => Partial<T>)) => {
       setState((prevState: T) => {
         const newState = typeof updater === 'function' 
           ? { ...prevState, ...updater(prevState) }
           : { ...prevState, ...updater };

         if (config.middleware?.onStateChange) {
           config.middleware.onStateChange(prevState, newState, 'setState');
         }

         return newState;
       });
     }, []);

    const value: ContextValue<T> = {
      state,
      actions: actions(),
      setState: setStateGeneric,
    };

    return React.createElement(Context.Provider, { value }, children);
  }

  // Custom hook for consuming the context
  function useContextHook(): ContextValue<T> {
    const context = useContext(Context);
    if (context === undefined) {
      throw new Error(`useContext for ${config.contextName} must be used within its Provider`);
    }
    return context;
  }

  // Selector hook for performance optimization
  function useContextSelector<K>(selector: (state: T) => K): K {
    const { state } = useContextHook();
    return selector(state);
  }

  return {
    Provider,
    useContext: useContextHook,
    useContextSelector,
    Context,
  };
}

// =============================================================================
// Middleware Implementation
// =============================================================================

class GenericReactContextMiddleware implements FynAppMiddleware {
  name = "react-context";
  version = "1.0.0";

  // Store context factories and instances
  private contextFactories = new Map<string, any>();
  private contextInstances = new WeakMap<FynApp, Map<string, any>>();
  private sharedContexts = new Map<string, any>(); // For shared contexts across FynApps

  async setup(kernel: any) {
    console.log("Generic React Context Middleware initialized");
  }

  async apply(fynApp: FynApp, context: MiddlewareContext) {
    const config = context.config as any;
    
    if (!config.contexts) {
      console.warn("No contexts configuration found for react-context middleware");
      return;
    }

    // Handle both array and object formats
    let contextsToProcess: any[] = [];
    if (Array.isArray(config.contexts)) {
      // Legacy array format
      contextsToProcess = config.contexts;
    } else if (typeof config.contexts === 'object') {
      // New object format: convert to array with contextName property
      contextsToProcess = Object.entries(config.contexts).map(([name, contextConfig]: [string, any]) => ({
        ...contextConfig,
        contextName: name
      }));
    }

    console.log(`Applying react-context middleware to ${fynApp.name} with ${contextsToProcess.length} contexts`);

    // Initialize contexts for this FynApp
    if (!this.contextInstances.has(fynApp)) {
      this.contextInstances.set(fynApp, new Map());
    }
    const fynAppContexts = this.contextInstances.get(fynApp)!;

    // Process each context configuration
    for (const contextConfig of contextsToProcess) {
      await this.createContext(fynApp, contextConfig, fynAppContexts);
    }

    // Wrap the FynApp's main component if it exists
    if (fynApp.mainModule && fynApp.mainModule.App) {
      this.wrapAppWithProviders(fynApp, fynAppContexts);
    }

    // Expose context APIs to the FynApp
    this.exposeContextAPIs(fynApp, fynAppContexts);
  }

  private async createContext(fynApp: FynApp, config: ContextConfig, fynAppContexts: Map<string, any>) {
    const contextKey = config.shared ? config.contextName : `${fynApp.name}-${config.contextName}`;

    // Create context factory if not exists
    if (!this.contextFactories.has(contextKey)) {
      const factory = createContextProvider(config);
      this.contextFactories.set(contextKey, factory);
      
      if (config.shared) {
        this.sharedContexts.set(config.contextName, factory);
      }
    }

    // Get the context factory
    const factory = config.shared 
      ? this.sharedContexts.get(config.contextName)
      : this.contextFactories.get(contextKey);

    // Store context instance for this FynApp
    fynAppContexts.set(config.contextName, {
      factory,
      config,
      shared: config.shared,
    });

    console.log(`Created context "${config.contextName}" for ${fynApp.name} (shared: ${config.shared})`);
  }

  private wrapAppWithProviders(fynApp: FynApp, fynAppContexts: Map<string, any>) {
    const OriginalApp = fynApp.mainModule.App;
    
    fynApp.mainModule.App = (props: any) => {
      // Create nested providers
      let WrappedApp = React.createElement(OriginalApp, props);

      // Wrap with each context provider
      for (const [contextName, contextData] of fynAppContexts.entries()) {
        const { factory, shared } = contextData;
        const fynAppId = shared ? undefined : fynApp.name;
        
        WrappedApp = React.createElement(
          factory.Provider,
          { fynAppId },
          WrappedApp
        );
      }

      return WrappedApp;
    };

    console.log(`Wrapped ${fynApp.name} App component with ${fynAppContexts.size} context providers`);
  }

  private exposeContextAPIs(fynApp: FynApp, fynAppContexts: Map<string, any>) {
    //
  }

  // Framework-agnostic context instance manager
  private globalContextInstances = new Map<string, any>();
  
  private getContextInstance(contextName: string, contextData: any) {
    const instanceKey = contextData.shared ? contextName : `${contextName}-${Date.now()}`;
    
    if (!this.globalContextInstances.has(instanceKey)) {
      // Create a global state instance
      const config = contextData.config;
      let currentState = { ...config.initialState };
      const listeners = new Set<Function>();
      
      // Create actions that modify global state
      const actions: Record<string, Function> = {};
      if (config.actions) {
        Object.entries(config.actions).forEach(([actionName, actionDef]: [string, any]) => {
          actions[actionName] = (...args: any[]) => {
            const prevState = currentState;
            
            // Handle both action formats
            let actionFn: any;
            let validator: any = null;
            
            if (typeof actionDef === 'function') {
              actionFn = actionDef;
            } else if (actionDef && typeof actionDef === 'object' && actionDef.reducer) {
              actionFn = actionDef.reducer;
              validator = actionDef.validator;
            } else {
              console.warn(`Invalid action definition for ${actionName}`);
              return;
            }
            
            // Validate if validator exists
            if (validator && !validator(prevState, ...args)) {
              console.warn(`Validation failed for action ${actionName} with args:`, args);
              return;
            }
            
            const result = actionFn(prevState, ...args);
            currentState = typeof result === 'function' 
              ? { ...prevState, ...result(prevState) }
              : { ...prevState, ...result };
            
            // Notify all listeners
            listeners.forEach(listener => listener(currentState, prevState));
            
            console.log(`Action ${actionName} executed for ${contextName}:`, currentState);
          };
        });
      }
      
      const instance = {
        get state() { return currentState; },
        actions,
        setState: (updater: any) => {
          const prevState = currentState;
          currentState = typeof updater === 'function' 
            ? { ...prevState, ...updater(prevState) }
            : { ...prevState, ...updater };
          listeners.forEach(listener => listener(currentState, prevState));
        },
        subscribe: (listener: Function) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      };
      
      this.globalContextInstances.set(instanceKey, instance);
    }
    
    return this.globalContextInstances.get(instanceKey);
  }
}

// =============================================================================
// Export for Federation
// =============================================================================

/**
 * Export middleware for federation loading
 * The kernel will look for exports that start with __middleware__
 */
export const __middleware__ReactContext = new GenericReactContextMiddleware(); 
