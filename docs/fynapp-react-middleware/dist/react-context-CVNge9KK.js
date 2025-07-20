
/*
exports: ReactContextMiddleware
facadeModuleId: /Users/jchen26/dev/fynmesh/demo/fynapp-react-middleware/src/middleware/react-context.tsx
moduleIds: /Users/jchen26/dev/fynmesh/demo/fynapp-react-middleware/src/middleware/react-context.tsx
dynamicImports: 
fileName: react-context-CVNge9KK.js
imports: esm-react
isEntry: false
*/
(function (Federation){
//
var System = Federation._mfBind(
  {
    n: 'react-context', // chunk name
    f: 'react-context-CVNge9KK.js', // chunk fileName
    c: 'fynapp-react-middleware', // federation container name
    s: 'fynmesh', // default scope name
    e: false, // chunk isEntry
    v: '1.0.0' // container version
  },
  // dirs from ids of modules included in the chunk
  // use these to match rvm in container to find required version
  // if this is empty, it means this chunk uses no shared module
  // %nm is token that replaced node_modules
  ["src/middleware"]
);

System.register(['esm-react'], (function (exports) {
    'use strict';
    var React, createContext, useMemo, useContext, useState, useRef, useEffect, useCallback;
    return {
        setters: [function (module) {
            React = module.default;
            createContext = module.createContext;
            useMemo = module.useMemo;
            useContext = module.useContext;
            useState = module.useState;
            useRef = module.useRef;
            useEffect = module.useEffect;
            useCallback = module.useCallback;
        }],
        execute: (function () {

            // @ts-ignore
            // =============================================================================
            // Storage Manager
            // =============================================================================
            class StorageManager {
                constructor() {
                    this.memoryStorage = new Map();
                }
                getStorageKey(config, fynAppId) {
                    return fynAppId ? `${config.key}-${fynAppId}` : config.key;
                }
                getStorageType(config) {
                    // Handle legacy 'type' property
                    return config.storage || config.type || 'memory';
                }
                load(config, initialState, fynAppId) {
                    try {
                        const key = this.getStorageKey(config, fynAppId);
                        const storageType = this.getStorageType(config);
                        let stored = null;
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
                    }
                    catch (error) {
                        console.warn(`Failed to load persisted state:`, error);
                    }
                    return initialState;
                }
                save(config, state, fynAppId) {
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
                    }
                    catch (error) {
                        console.warn(`Failed to persist state:`, error);
                    }
                }
                clear(config, fynAppId) {
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
                    }
                    catch (error) {
                        console.warn(`Failed to clear persisted state:`, error);
                    }
                }
            }
            // =============================================================================
            // Context Provider Factory
            // =============================================================================
            function createContextProvider(config, storageManager) {
                const Context = createContext(undefined);
                function Provider({ children, fynAppId, externalState }) {
                    // Use external state store if provided, otherwise use internal React state
                    const [internalState, setInternalState] = useState(() => {
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
                    const prevStateRef = useRef(state);
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
                        if (!config.actions)
                            return {};
                        const actionMap = {};
                        Object.entries(config.actions).forEach(([actionName, actionDef]) => {
                            actionMap[actionName] = (...args) => {
                                // Use external state methods if available and action name matches
                                if (externalState && typeof externalState[actionName] === 'function') {
                                    externalState[actionName](...args);
                                    return;
                                }
                                // Otherwise use regular setState logic
                                setState((prevState) => {
                                    var _a, _b, _c;
                                    try {
                                        // Handle both old and new action formats
                                        let actionFn;
                                        let validator;
                                        if (typeof actionDef === 'function') {
                                            // Legacy format: direct function
                                            actionFn = actionDef;
                                        }
                                        else if (actionDef && typeof actionDef === 'object' && 'reducer' in actionDef) {
                                            // New format: { validator, reducer }
                                            actionFn = actionDef.reducer;
                                            validator = actionDef.validator;
                                        }
                                        else {
                                            console.warn(`Invalid action definition for ${actionName} in context ${config.contextName}`);
                                            return prevState;
                                        }
                                        // Validate action arguments if validator exists
                                        if (validator && !validator(prevState, ...args)) {
                                            console.warn(`Validation failed for action ${actionName} in context ${config.contextName}`, args);
                                            return prevState;
                                        }
                                        // Validate current state if global validator provided
                                        if (((_a = config.middleware) === null || _a === void 0 ? void 0 : _a.validation) && !config.middleware.validation(prevState, config.contextName)) {
                                            console.warn(`State validation failed for context ${config.contextName}`);
                                            return prevState;
                                        }
                                        const result = actionFn(prevState, ...args);
                                        const newState = typeof result === 'function'
                                            ? { ...prevState, ...result(prevState) }
                                            : { ...prevState, ...result };
                                        // Call middleware hook
                                        if ((_b = config.middleware) === null || _b === void 0 ? void 0 : _b.onStateChange) {
                                            config.middleware.onStateChange(prevState, newState, actionName, config.contextName);
                                        }
                                        return newState;
                                    }
                                    catch (error) {
                                        console.error(`Error in action ${actionName} for context ${config.contextName}:`, error);
                                        if ((_c = config.middleware) === null || _c === void 0 ? void 0 : _c.onError) {
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
                    const setStateGeneric = useCallback((updater) => {
                        var _a;
                        if (externalState) {
                            // Use external state's setState method
                            const currentState = externalState.getState();
                            const newState = typeof updater === 'function'
                                ? { ...currentState, ...updater(currentState) }
                                : { ...currentState, ...updater };
                            externalState.setState(newState);
                            if ((_a = config.middleware) === null || _a === void 0 ? void 0 : _a.onStateChange) {
                                config.middleware.onStateChange(currentState, newState, 'setState', config.contextName);
                            }
                        }
                        else {
                            // Use internal React state
                            setState((prevState) => {
                                var _a, _b;
                                try {
                                    const newState = typeof updater === 'function'
                                        ? { ...prevState, ...updater(prevState) }
                                        : { ...prevState, ...updater };
                                    if ((_a = config.middleware) === null || _a === void 0 ? void 0 : _a.onStateChange) {
                                        config.middleware.onStateChange(prevState, newState, 'setState', config.contextName);
                                    }
                                    return newState;
                                }
                                catch (error) {
                                    console.error(`Error in setState for context ${config.contextName}:`, error);
                                    if ((_b = config.middleware) === null || _b === void 0 ? void 0 : _b.onError) {
                                        config.middleware.onError(error instanceof Error ? error : new Error(String(error)), config.contextName);
                                    }
                                    return prevState;
                                }
                            });
                        }
                    }, [externalState]);
                    const value = useMemo(() => ({
                        state,
                        actions,
                        setState: setStateGeneric,
                    }), [state, actions, setStateGeneric, externalState]);
                    return React.createElement(Context.Provider, { value }, children);
                }
                // Custom hook for consuming the context
                function useContextHook() {
                    const context = useContext(Context);
                    if (context === undefined) {
                        throw new Error(`useContext for ${config.contextName} must be used within its Provider`);
                    }
                    return context;
                }
                // Selector hook for performance optimization
                function useContextSelector(selector) {
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
            class ReactContextMiddleware {
                constructor() {
                    this.name = "react-context";
                    this.storageManager = new StorageManager();
                    this.contextFactories = new Map();
                    this.contextInstances = new WeakMap();
                    this.sharedContexts = new Map();
                    this.sharedProviderInstances = new Map();
                    this.sharedProviderSymbols = new Map();
                    this.sharedStateStores = new Map(); // NEW: Shared state stores outside React
                    this.secondaryConsumers = new Set(); // Track secondary consumers for updates
                }
                async setup(_context) {
                    console.log(`${this.name} middleware initialized`);
                }
                /**
                 * Check if middleware is ready for specific user requirements
                 * This is called after user.initialize() to determine if we can fulfill their needs
                 */
                isReadyForUser(userRequirements) {
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
                async apply(callContext) {
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
                    }
                    catch (error) {
                        console.error(`Error applying ${this.name} middleware to ${callContext.fynApp.name}:`, error);
                        throw error;
                    }
                }
                async handlePrimaryProvider(context) {
                    const validatedConfig = this.validateConfig(context.meta.config);
                    const contextsToProcess = this.normalizeContextsConfig(validatedConfig.contexts);
                    console.log(`Processing ${contextsToProcess.length} contexts for primary provider ${context.fynApp.name}`);
                    // Initialize contexts for this FynApp
                    if (!this.contextInstances.has(context.fynApp)) {
                        this.contextInstances.set(context.fynApp, new Map());
                    }
                    const fynAppContexts = this.contextInstances.get(context.fynApp);
                    // Process each context configuration
                    for (const contextConfig of contextsToProcess) {
                        await this.createContext(context, contextConfig, fynAppContexts);
                    }
                    // Expose context APIs to the FynApp
                    this.exposeContextAPIs(context.fynApp, fynAppContexts);
                }
                async handleSecondaryConsumer(context) {
                    // Track this FynApp as a secondary consumer
                    this.secondaryConsumers.add(context.fynApp);
                    // Initialize contexts for this FynApp
                    if (!this.contextInstances.has(context.fynApp)) {
                        this.contextInstances.set(context.fynApp, new Map());
                    }
                    const fynAppContexts = this.contextInstances.get(context.fynApp);
                    // For secondary consumers, expose access to all existing shared contexts
                    for (const [contextName, sharedFactory] of this.sharedContexts.entries()) {
                        // Create a lightweight context reference that points to the shared context
                        const sharedSymbol = this.sharedProviderSymbols.get(contextName);
                        const sharedProvider = this.sharedProviderInstances.get(contextName);
                        if (sharedSymbol && sharedProvider) {
                            // Create a minimal context config for the shared context
                            const sharedConfig = {
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
                validateConfig(config) {
                    if (!config || typeof config !== 'object') {
                        throw new Error('Invalid configuration: config must be an object');
                    }
                    if (!config.contexts) {
                        throw new Error('Invalid configuration: contexts property is required');
                    }
                    return config;
                }
                normalizeContextsConfig(contexts) {
                    if (Array.isArray(contexts)) {
                        // Legacy array format - validate each context has contextName
                        return contexts.map(ctx => {
                            if (!ctx.contextName) {
                                throw new Error('Context configuration missing contextName');
                            }
                            return ctx;
                        });
                    }
                    else if (typeof contexts === 'object') {
                        // New object format: convert to array with contextName property
                        return Object.entries(contexts).map(([name, contextConfig]) => ({
                            ...contextConfig,
                            contextName: name
                        }));
                    }
                    else {
                        throw new Error('Invalid contexts configuration: must be array or object');
                    }
                }
                async createContext(context, config, fynAppContexts) {
                    const contextKey = config.shared ? config.contextName : `${context.fynApp.name}-${config.contextName}`;
                    // For shared contexts, use the shared factory; for non-shared, create FynApp-specific factory
                    let factory;
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
                            const SharedProvider = ({ children }) => {
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
                        }
                        else {
                            console.log(`Reusing existing shared context factory for "${config.contextName}"`);
                            factory = this.sharedContexts.get(config.contextName);
                        }
                    }
                    else {
                        // Create FynApp-specific factory if not exists
                        if (!this.contextFactories.has(contextKey)) {
                            console.log(`Creating FynApp-specific context factory for "${contextKey}"`);
                            factory = createContextProvider(config, this.storageManager);
                            this.contextFactories.set(contextKey, factory);
                        }
                        else {
                            factory = this.contextFactories.get(contextKey);
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
                updateSecondaryConsumers(contextName, factory) {
                    // Update all secondary consumers to give them access to the new shared context
                    for (const secondaryFynApp of this.secondaryConsumers) {
                        const fynAppContexts = this.contextInstances.get(secondaryFynApp);
                        if (fynAppContexts) {
                            const sharedSymbol = this.sharedProviderSymbols.get(contextName);
                            const sharedProvider = this.sharedProviderInstances.get(contextName);
                            if (sharedSymbol && sharedProvider) {
                                // Create a minimal context config for the shared context
                                const sharedConfig = {
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
                createSharedStateStore(config) {
                    // Create a shared state store based on the context configuration
                    if (config.contextName === 'counter') {
                        // For counter context, create a shared store with counter state
                        const listeners = new Set();
                        let state = { count: 0 };
                        const sharedStore = {
                            getState: () => state,
                            setState: (newState) => {
                                state = { ...state, ...newState };
                                // Notify all listeners
                                listeners.forEach(listener => listener());
                            },
                            subscribe: (listener) => {
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
                        setState: () => { },
                        subscribe: () => () => { }
                    };
                }
                exposeContextAPIs(fynApp, fynAppContexts) {
                    // Expose context hooks and utilities to the FynApp
                    const contextAPIs = {};
                    const sharedProviderSymbols = {}; // NEW: Collect symbols for shared providers
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
                        }
                        else {
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
                    const getSharedProvider = (symbol) => {
                        for (const [contextName, contextSymbol] of this.sharedProviderSymbols.entries()) {
                            if (contextSymbol === symbol) {
                                return this.sharedProviderInstances.get(contextName);
                            }
                        }
                        return undefined;
                    };
                    // Lazy getter for shared symbols - allows access even if contexts aren't created yet
                    const getLazySharedSymbols = () => {
                        const symbols = {};
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
                cleanup(fynApp) {
                    const contexts = this.contextInstances.get(fynApp);
                    if (contexts) {
                        for (const [contextName, contextData] of contexts.entries()) {
                            if (contextData.config.persistence) {
                                // Clear persistence if needed
                                this.storageManager.clear(contextData.config.persistence, contextData.shared ? undefined : fynApp.name);
                            }
                        }
                        this.contextInstances.delete(fynApp);
                    }
                    // Remove from secondary consumers tracking
                    this.secondaryConsumers.delete(fynApp);
                }
                // Debug method to list active contexts
                listContexts(fynApp) {
                    if (fynApp) {
                        const contexts = this.contextInstances.get(fynApp);
                        return contexts ? Array.from(contexts.keys()) : [];
                    }
                    return Array.from(this.contextFactories.keys());
                }
            } exports("ReactContextMiddleware", ReactContextMiddleware);

        })
    };
}));

})(globalThis.Federation);
//# sourceMappingURL=react-context-CVNge9KK.js.map
