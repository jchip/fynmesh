// @ts-ignore
import React, { 
  createContext, 
  useContext, 
  useState, 
  useCallback, 
  useRef, 
  useEffect, 
  useMemo,
  ReactNode,
} from "react";

import type { FynApp, FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Action definition with optional validation
 */
export interface ActionDefinition<T = any> {
  reducer: (state: T, ...args: any[]) => Partial<T> | ((prevState: T) => Partial<T>);
  validator?: (state: T, ...args: any[]) => boolean;
}

/**
 * Storage configuration for context persistence
 */
export interface PersistenceConfig {
  key: string;
  storage: 'localStorage' | 'sessionStorage' | 'memory';
  /** @deprecated Use storage instead */
  type?: 'localStorage' | 'sessionStorage' | 'memory';
}

/**
 * Middleware hooks for context state changes
 */
export interface ContextMiddlewareHooks<T = any> {
  onStateChange?: (oldState: T, newState: T, action: string, contextName: string) => void;
  validation?: (state: T, contextName: string) => boolean;
  onError?: (error: Error, contextName: string) => void;
}

/**
 * Configuration for a single context
 */
export interface ContextConfig<T = any> {
  contextName: string;
  initialState: T;
  actions?: Record<string, ActionDefinition<T> | ((state: T, ...args: any[]) => Partial<T>)>;
  persistence?: PersistenceConfig;
  shared?: boolean;
  middleware?: ContextMiddlewareHooks<T>;
}

/**
 * Context value provided to React components
 */
export interface ContextValue<T = any> {
  state: T;
  actions: Record<string, (...args: any[]) => void>;
  setState: (updater: Partial<T> | ((prevState: T) => Partial<T>)) => void;
}

/**
 * Configuration for the React Context middleware
 */
export interface ReactContextMiddlewareConfig {
  contexts: ContextConfig[] | Record<string, Omit<ContextConfig, 'contextName'>>;
}

/**
 * Context factory interface
 */
interface ContextFactory<T = any> {
  Provider: React.ComponentType<{ children: ReactNode; fynAppId?: string; externalState?: any }>;
  useContext: () => ContextValue<T>;
  useContextSelector: <K>(selector: (state: T) => K) => K;
  Context: React.Context<ContextValue<T> | undefined>;
}

/**
 * Context instance data
 */
interface ContextInstanceData {
  factory: ContextFactory;
  config: ContextConfig;
  shared: boolean;
}

// =============================================================================
// Error Boundary Component
// =============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  contextName: string;
  onError?: (error: Error, contextName: string) => void;
}

function ContextErrorBoundary({ children, contextName, onError }: ErrorBoundaryProps) {
  // Simple error boundary wrapper
  // For production, consider using react-error-boundary library
  try {
    return React.createElement(React.Fragment, null, children);
  } catch (error) {
    console.error(`Error in context ${contextName}:`, error);
    onError?.(error instanceof Error ? error : new Error(String(error)), contextName);
    
    return React.createElement('div', {
      style: { padding: '20px', border: '1px solid red', backgroundColor: '#fee' }
    }, [
      React.createElement('h3', { key: 'title' }, `Context Error: ${contextName}`),
      React.createElement('p', { key: 'message' }, 'An error occurred in this context. Check console for details.'),
    ]);
  }
}

// =============================================================================
// Storage Manager
// =============================================================================

class StorageManager {
  private memoryStorage = new Map<string, any>();

  private getStorageKey(config: PersistenceConfig, fynAppId?: string): string {
    return fynAppId ? `${config.key}-${fynAppId}` : config.key;
  }

  private getStorageType(config: PersistenceConfig): 'localStorage' | 'sessionStorage' | 'memory' {
    // Handle legacy 'type' property
    return config.storage || config.type || 'memory';
  }

  load<T>(config: PersistenceConfig, initialState: T, fynAppId?: string): T {
    try {
      const key = this.getStorageKey(config, fynAppId);
      const storageType = this.getStorageType(config);
      
      let stored: string | null = null;
      
      switch (storageType) {
        case 'localStorage':
          if (typeof window !== 'undefined' && window.localStorage) {
            stored = localStorage.getItem(key);
          }
          break;
        case 'sessionStorage':
          if (typeof window !== 'undefined' && window.sessionStorage) {
            stored = sessionStorage.getItem(key);
          }
          break;
        case 'memory':
          stored = this.memoryStorage.get(key) || null;
          break;
      }
      
      if (stored) {
        const parsedState = typeof stored === 'string' ? JSON.parse(stored) : stored;
        return { ...initialState, ...parsedState };
      }
    } catch (error) {
      console.warn(`Failed to load persisted state:`, error);
    }
    
    return initialState;
  }

  save<T>(config: PersistenceConfig, state: T, fynAppId?: string): void {
    try {
      const key = this.getStorageKey(config, fynAppId);
      const storageType = this.getStorageType(config);
      const serialized = JSON.stringify(state);
      
      switch (storageType) {
        case 'localStorage':
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(key, serialized);
          }
          break;
        case 'sessionStorage':
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.setItem(key, serialized);
          }
          break;
        case 'memory':
          this.memoryStorage.set(key, serialized);
          break;
      }
    } catch (error) {
      console.warn(`Failed to persist state:`, error);
    }
  }

  clear(config: PersistenceConfig, fynAppId?: string): void {
    try {
      const key = this.getStorageKey(config, fynAppId);
      const storageType = this.getStorageType(config);
      
      switch (storageType) {
        case 'localStorage':
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(key);
          }
          break;
        case 'sessionStorage':
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.removeItem(key);
          }
          break;
        case 'memory':
          this.memoryStorage.delete(key);
          break;
      }
    } catch (error) {
      console.warn(`Failed to clear persisted state:`, error);
    }
  }
}

// =============================================================================
// Context Provider Factory
// =============================================================================

function createContextProvider<T>(config: ContextConfig<T>, storageManager: StorageManager): ContextFactory<T> {
  const Context = createContext<ContextValue<T> | undefined>(undefined);

  function Provider({ children, fynAppId, externalState }: { children: ReactNode; fynAppId?: string; externalState?: any }) {
    // Use external state store if provided, otherwise use internal React state
    const [internalState, setInternalState] = useState<T>(() => {
      if (externalState) {
        // If using external state, get initial state from it
        return externalState.getState();
      }
      // Load initial state from persistence for internal state
      if (config.persistence) {
        return storageManager.load(config.persistence, config.initialState, fynAppId);
      }
      return config.initialState;
    });

    const [state, setState] = useMemo(() => {
      if (externalState) {
        // Use external state store
        return [externalState.getState(), externalState.setState];
      }
      // Use internal React state
      return [internalState, setInternalState];
    }, [externalState, internalState]);

    const prevStateRef = useRef<T>(state);

    // Subscribe to external state changes
    useEffect(() => {
      if (externalState) {
        const unsubscribe = externalState.subscribe(() => {
          const newState = externalState.getState();
          setInternalState(newState);
        });
        return unsubscribe;
      }
    }, [externalState]);

    // Persist state changes (only for internal state, external state handles its own persistence)
    useEffect(() => {
      if (!externalState && config.persistence && prevStateRef.current !== state) {
        storageManager.save(config.persistence, state, fynAppId);
      }
      prevStateRef.current = state;
    }, [state, fynAppId, externalState]);

    // Create memoized actions
    const actions = useMemo(() => {
      if (!config.actions) return {};

      const actionMap: Record<string, (...args: any[]) => void> = {};

      Object.entries(config.actions).forEach(([actionName, actionDef]) => {
        actionMap[actionName] = (...args: any[]) => {
          // Use external state methods if available and action name matches
          if (externalState && typeof externalState[actionName] === 'function') {
            externalState[actionName](...args);
            return;
          }
          
          // Otherwise use regular setState logic
          setState((prevState: T) => {
            try {
              // Handle both old and new action formats
              let actionFn: (state: T, ...args: any[]) => Partial<T> | ((prevState: T) => Partial<T>);
              let validator: ((state: T, ...args: any[]) => boolean) | undefined;
              
              if (typeof actionDef === 'function') {
                // Legacy format: direct function
                actionFn = actionDef;
              } else if (actionDef && typeof actionDef === 'object' && 'reducer' in actionDef) {
                // New format: { validator, reducer }
                actionFn = actionDef.reducer;
                validator = actionDef.validator;
              } else {
                console.warn(`Invalid action definition for ${actionName} in context ${config.contextName}`);
                return prevState;
              }
              
              // Validate action arguments if validator exists
              if (validator && !validator(prevState, ...args)) {
                console.warn(`Validation failed for action ${actionName} in context ${config.contextName}`, args);
                return prevState;
              }

              // Validate current state if global validator provided
              if (config.middleware?.validation && !config.middleware.validation(prevState, config.contextName)) {
                console.warn(`State validation failed for context ${config.contextName}`);
                return prevState;
              }

              const result = actionFn(prevState, ...args);
              const newState = typeof result === 'function' 
                ? { ...prevState, ...result(prevState) }
                : { ...prevState, ...result };

              // Call middleware hook
              if (config.middleware?.onStateChange) {
                config.middleware.onStateChange(prevState, newState, actionName, config.contextName);
              }

              return newState;
            } catch (error) {
              console.error(`Error in action ${actionName} for context ${config.contextName}:`, error);
              if (config.middleware?.onError) {
                config.middleware.onError(error instanceof Error ? error : new Error(String(error)), config.contextName);
              }
              return prevState;
            }
          });
        };
      });

      return actionMap;
    }, [externalState]);

    // Generic setState function
    const setStateGeneric = useCallback((updater: Partial<T> | ((prevState: T) => Partial<T>)) => {
      if (externalState) {
        // Use external state's setState method
        const currentState = externalState.getState();
        const newState = typeof updater === 'function' 
          ? { ...currentState, ...updater(currentState) }
          : { ...currentState, ...updater };
        
        externalState.setState(newState);
        
        if (config.middleware?.onStateChange) {
          config.middleware.onStateChange(currentState, newState, 'setState', config.contextName);
        }
      } else {
        // Use internal React state
        setState((prevState: T) => {
          try {
            const newState = typeof updater === 'function' 
              ? { ...prevState, ...updater(prevState) }
              : { ...prevState, ...updater };

            if (config.middleware?.onStateChange) {
              config.middleware.onStateChange(prevState, newState, 'setState', config.contextName);
            }

            return newState;
          } catch (error) {
            console.error(`Error in setState for context ${config.contextName}:`, error);
            if (config.middleware?.onError) {
              config.middleware.onError(error instanceof Error ? error : new Error(String(error)), config.contextName);
            }
            return prevState;
          }
        });
      }
    }, [externalState]);

    const value: ContextValue<T> = useMemo(() => ({
      state,
      actions,
      setState: setStateGeneric,
    }), [state, actions, setStateGeneric, externalState]);

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
    return useMemo(() => selector(state), [state, selector]);
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

export class ReactContextMiddleware implements FynAppMiddleware {
  public readonly name = "react-context";

  private storageManager = new StorageManager();
  private contextFactories = new Map<string, ContextFactory>();
  private contextInstances = new WeakMap<FynApp, Map<string, ContextInstanceData>>();
  private sharedContexts = new Map<string, ContextFactory>();
  private sharedProviderInstances = new Map<string, React.ComponentType<{ children: ReactNode }>>();
  private sharedProviderSymbols = new Map<string, symbol>();
  private sharedStateStores = new Map<string, any>(); // NEW: Shared state stores outside React
  private secondaryConsumers = new Set<FynApp>(); // Track secondary consumers for updates
  private readyCallback?: () => void; // 🆕 Callback to signal readiness

  async setup(_context: FynAppMiddlewareCallContext): Promise<void> {
    console.log(`${this.name} middleware initialized`);
  }

  /**
   * Check if middleware is ready for specific user requirements
   * This is called after user.initialize() to determine if we can fulfill their needs
   */
  isReadyForUser(userRequirements: any): boolean {
    console.log(`🔍 ${this.name} checking readiness for user requirements:`, userRequirements);
    
    // If no specific requirements, we're ready
    if (!userRequirements) {
      return true;
    }
    
    // Handle consumer mode - check if required contexts exist
    if (userRequirements.mode === "consumer" && userRequirements.requiredContexts) {
      for (const contextName of userRequirements.requiredContexts) {
        if (!this.sharedContexts.has(contextName)) {
          console.log(`❌ Required shared context "${contextName}" not available yet`);
          return false;
        }
      }
      console.log(`✅ All required shared contexts available`);
      return true;
    }
    
    // Handle provider mode - always ready to create contexts
    if (userRequirements.mode === "provider") {
      console.log(`✅ Provider mode - ready to create contexts`);
      return true;
    }
    
    // Default to ready for unknown modes
    console.log(`✅ Unknown mode - defaulting to ready`);
    return true;
  }

  async apply(callContext: FynAppMiddlewareCallContext): Promise<void> {
    try {
      // Store ready callback for signaling when shared contexts are created
      if (callContext.meta.requireReady && !this.readyCallback) {
        this.readyCallback = callContext.meta.requireReady;
      }

      // Handle different configuration types
      if (!callContext.meta.config) {
        console.log(`${this.name} middleware: No configuration found for ${callContext.fynApp.name}, skipping application`);
        return;
      }

      // Check if this is a secondary "consume-only" app
      if (typeof callContext.meta.config === 'string' && callContext.meta.config === 'consume-only') {
        console.log(`${this.name} middleware: ${callContext.fynApp.name} is a secondary consumer, exposing shared contexts only`);
        await this.handleSecondaryConsumer(callContext);
        return;
      }

      // Handle primary app with full configuration
      if (typeof callContext.meta.config === 'object' && callContext.meta.config.contexts) {
        console.log(`${this.name} middleware: ${callContext.fynApp.name} is a primary provider, processing full configuration`);
        return;
      }

      // Handle empty/invalid configuration
      console.log(`${this.name} middleware: Invalid configuration for ${callContext.fynApp.name}, skipping application`);
      return;

    } catch (error) {
      console.error(`Error applying ${this.name} middleware to ${callContext.fynApp.name}:`, error);
      throw error;
    }
  }

  private async handlePrimaryProvider(context: FynAppMiddlewareCallContext): Promise<void> {
    const validatedConfig = this.validateConfig(context.meta.config);
    const contextsToProcess = this.normalizeContextsConfig(validatedConfig.contexts);
    
    console.log(`Processing ${contextsToProcess.length} contexts for primary provider ${context.fynApp.name}`);

    // Initialize contexts for this FynApp
    if (!this.contextInstances.has(context.fynApp)) {
      this.contextInstances.set(context.fynApp, new Map());
    }
    const fynAppContexts = this.contextInstances.get(context.fynApp)!;

    // Process each context configuration
    for (const contextConfig of contextsToProcess) {
      await this.createContext(context, contextConfig, fynAppContexts);
    }

    // Expose context APIs to the FynApp
      this.exposeContextAPIs(context.fynApp, fynAppContexts);
  }

  private async handleSecondaryConsumer(context: FynAppMiddlewareCallContext): Promise<void> {
    // Track this FynApp as a secondary consumer
    this.secondaryConsumers.add(context.fynApp);
    
    // Initialize contexts for this FynApp
    if (!this.contextInstances.has(context.fynApp)) {
      this.contextInstances.set(context.fynApp, new Map());
    }
    const fynAppContexts = this.contextInstances.get(context.fynApp)!;

    // For secondary consumers, expose access to all existing shared contexts
    for (const [contextName, sharedFactory] of this.sharedContexts.entries()) {
      // Create a lightweight context reference that points to the shared context
      const sharedSymbol = this.sharedProviderSymbols.get(contextName);
      const sharedProvider = this.sharedProviderInstances.get(contextName);
      
      if (sharedSymbol && sharedProvider) {
        // Create a minimal context config for the shared context
        const sharedConfig: ContextConfig = {
          contextName,
          initialState: {},
          shared: true,
        };

        fynAppContexts.set(contextName, {
          factory: sharedFactory,
          config: sharedConfig,
          shared: true,
        });

        console.log(`Secondary consumer ${context.fynApp.name} can access shared context "${contextName}"`);
      }
    }

    // Always expose context APIs (even if no shared contexts exist yet)
    this.exposeContextAPIs(context.fynApp, fynAppContexts);
    
    // If no shared contexts available yet, log info message
    if (this.sharedContexts.size === 0) {
      console.log(`Secondary consumer ${context.fynApp.name} loaded before primary provider - shared contexts will be available once primary loads`);
    }
  }

  private validateConfig(config: any): ReactContextMiddlewareConfig {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration: config must be an object');
    }
    
    if (!config.contexts) {
      throw new Error('Invalid configuration: contexts property is required');
    }
    
    return config as ReactContextMiddlewareConfig;
  }

  private normalizeContextsConfig(contexts: ReactContextMiddlewareConfig['contexts']): ContextConfig[] {
    if (Array.isArray(contexts)) {
      // Legacy array format - validate each context has contextName
      return contexts.map(ctx => {
        if (!ctx.contextName) {
          throw new Error('Context configuration missing contextName');
        }
        return ctx;
      });
    } else if (typeof contexts === 'object') {
      // New object format: convert to array with contextName property
      return Object.entries(contexts).map(([name, contextConfig]) => ({
        ...contextConfig,
        contextName: name
      }));
    } else {
      throw new Error('Invalid contexts configuration: must be array or object');
    }
  }

  private async createContext(context: FynAppMiddlewareCallContext, config: ContextConfig, fynAppContexts: Map<string, ContextInstanceData>): Promise<void> {
    const contextKey = config.shared ? config.contextName : `${context.fynApp.name}-${config.contextName}`;

    // For shared contexts, use the shared factory; for non-shared, create FynApp-specific factory
    let factory: ContextFactory;
    
    if (config.shared) {
      // Check if shared factory already exists
      if (!this.sharedContexts.has(config.contextName)) {
        console.log(`Creating shared context factory for "${config.contextName}"`);
        factory = createContextProvider(config, this.storageManager);
        this.sharedContexts.set(config.contextName, factory);
        
        // Create a Symbol for this shared provider
        const sharedSymbol = Symbol(`shared-provider-${config.contextName}`);
        this.sharedProviderSymbols.set(config.contextName, sharedSymbol);
        
        // Create shared state store outside React context
        const sharedStore = this.createSharedStateStore(config);
        this.sharedStateStores.set(config.contextName, sharedStore);
        
        // Create a shared Provider component that uses the shared store
        const SharedProvider = ({ children }: { children: ReactNode }) => {
          return React.createElement(factory.Provider, { 
            children,
            externalState: sharedStore // Pass shared store to provider
          });
        };
        this.sharedProviderInstances.set(config.contextName, SharedProvider);
        console.log(`Created shared Provider instance with shared store for "${config.contextName}"`);
        
        // Signal that middleware is now ready (has shared contexts)
        if (this.readyCallback && this.sharedContexts.size === 1) {
          console.log(`🔔 ${this.name} middleware signaling ready - first shared context created`);
          this.readyCallback();
        }
        
        // Update all secondary consumers to give them access to this new shared context
        this.updateSecondaryConsumers(config.contextName, factory);
      } else {
        console.log(`Reusing existing shared context factory for "${config.contextName}"`);
        factory = this.sharedContexts.get(config.contextName)!;
      }
    } else {
      // Create FynApp-specific factory if not exists
      if (!this.contextFactories.has(contextKey)) {
        console.log(`Creating FynApp-specific context factory for "${contextKey}"`);
        factory = createContextProvider(config, this.storageManager);
        this.contextFactories.set(contextKey, factory);
      } else {
        factory = this.contextFactories.get(contextKey)!;
      }
    }

    // Store context instance for this FynApp
    fynAppContexts.set(config.contextName, {
      factory,
      config,
      shared: config.shared || false,
    });

    console.log(`Configured context "${config.contextName}" for ${context.fynApp.name} (shared: ${config.shared || false})`);
  }

  private updateSecondaryConsumers(contextName: string, factory: ContextFactory): void {
    // Update all secondary consumers to give them access to the new shared context
    for (const secondaryFynApp of this.secondaryConsumers) {
      const fynAppContexts = this.contextInstances.get(secondaryFynApp);
      if (fynAppContexts) {
        const sharedSymbol = this.sharedProviderSymbols.get(contextName);
        const sharedProvider = this.sharedProviderInstances.get(contextName);
        
        if (sharedSymbol && sharedProvider) {
          // Create a minimal context config for the shared context
          const sharedConfig: ContextConfig = {
            contextName,
            initialState: {},
            shared: true,
          };

          fynAppContexts.set(contextName, {
            factory,
            config: sharedConfig,
            shared: true,
          });

          // Re-expose context APIs to update the secondary consumer
          this.exposeContextAPIs(secondaryFynApp, fynAppContexts);
          
          console.log(`Updated secondary consumer ${secondaryFynApp.name} with new shared context "${contextName}"`);
        }
      }
    }
  }

  private createSharedStateStore(config: ContextConfig): any {
    // Create a shared state store based on the context configuration
    if (config.contextName === 'counter') {
      // For counter context, create a shared store with counter state
      const listeners = new Set<() => void>();
      let state = { count: 0 };
      
      const sharedStore = {
        getState: () => state,
        setState: (newState: any) => {
          state = { ...state, ...newState };
          // Notify all listeners
          listeners.forEach(listener => listener());
        },
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        // Counter-specific methods
        increment: () => {
          state = { ...state, count: state.count + 1 };
          listeners.forEach(listener => listener());
        },
        decrement: () => {
          state = { ...state, count: state.count - 1 };
          listeners.forEach(listener => listener());
        },
        reset: () => {
          state = { ...state, count: 0 };
          listeners.forEach(listener => listener());
        }
      };
      
      console.log(`Created shared state store for counter context`);
      return sharedStore;
    }
    
    // Default shared store for other contexts
    return {
      getState: () => ({}),
      setState: () => {},
      subscribe: () => () => {}
    };
  }

  private exposeContextAPIs(fynApp: FynApp, fynAppContexts: Map<string, ContextInstanceData>): void {
    // Expose context hooks and utilities to the FynApp
    const contextAPIs: Record<string, any> = {};
    const sharedProviderSymbols: Record<string, symbol> = {}; // NEW: Collect symbols for shared providers
    
    for (const [contextName, contextData] of fynAppContexts.entries()) {
      const { factory, config } = contextData;
      
      if (config.shared) {
        // For shared contexts, provide the shared Provider instance and symbol
        const sharedProvider = this.sharedProviderInstances.get(contextName);
        const sharedSymbol = this.sharedProviderSymbols.get(contextName);
        
        contextAPIs[contextName] = {
          useContext: factory.useContext,
          useContextSelector: factory.useContextSelector,
          Context: factory.Context,
          Provider: factory.Provider, // Original Provider (for manual use)
          SharedProvider: sharedProvider, // Pre-configured shared Provider
        };
        
        if (sharedSymbol) {
          sharedProviderSymbols[contextName] = sharedSymbol;
        }
        
        console.log(`Exposed shared Provider for context "${contextName}" to ${fynApp.name}`);
      } else {
        // For non-shared contexts, provide the regular Provider
        contextAPIs[contextName] = {
          useContext: factory.useContext,
          useContextSelector: factory.useContextSelector,
          Context: factory.Context,
          Provider: factory.Provider,
        };
      }
    }

    // Method to get shared provider by symbol
    const getSharedProvider = (symbol: symbol): React.ComponentType<{ children: ReactNode }> | undefined => {
      for (const [contextName, contextSymbol] of this.sharedProviderSymbols.entries()) {
        if (contextSymbol === symbol) {
          return this.sharedProviderInstances.get(contextName);
        }
      }
      return undefined;
    };

    // Lazy getter for shared symbols - allows access even if contexts aren't created yet
    const getLazySharedSymbols = (): Record<string, symbol> => {
      const symbols: Record<string, symbol> = {};
      for (const [contextName, symbol] of this.sharedProviderSymbols.entries()) {
        symbols[contextName] = symbol;
      }
      return symbols;
    };

    // Store APIs in middlewareContext (kernel guarantees this exists)
    fynApp.middlewareContext.set(this.name, { 
      ...contextAPIs, 
      getSharedProvider, // Add the method to get shared providers by symbol
      getLazySharedSymbols // Add lazy getter for shared symbols
    });
    
    // Store shared provider symbols under a documented key (with lazy getter)
    fynApp.middlewareContext.set(`${this.name}:shared-symbols`, getLazySharedSymbols());
    
    if (Object.keys(sharedProviderSymbols).length > 0) {
      console.log(`Stored shared provider symbols for ${Object.keys(sharedProviderSymbols).join(', ')} in ${fynApp.name}`);
    }
    
    console.log(`Exposed ${Object.keys(contextAPIs).join(', ')} context APIs to ${fynApp.name} via middlewareContext`);
  }

  // Cleanup method for proper disposal
  public cleanup(fynApp: FynApp): void {
    const contexts = this.contextInstances.get(fynApp);
    if (contexts) {
      for (const [contextName, contextData] of contexts.entries()) {
        if (contextData.config.persistence) {
          // Clear persistence if needed
          this.storageManager.clear(contextData.config.persistence, 
            contextData.shared ? undefined : fynApp.name);
        }
      }
      this.contextInstances.delete(fynApp);
    }
    
    // Remove from secondary consumers tracking
    this.secondaryConsumers.delete(fynApp);
  }

  // Debug method to list active contexts
  public listContexts(fynApp?: FynApp): string[] {
    if (fynApp) {
      const contexts = this.contextInstances.get(fynApp);
      return contexts ? Array.from(contexts.keys()) : [];
    }
    return Array.from(this.contextFactories.keys());
  }
}
