import type { FynApp, FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";
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
export declare class ReactContextMiddleware implements FynAppMiddleware {
    readonly name = "react-context";
    private storageManager;
    private contextFactories;
    private contextInstances;
    private sharedContexts;
    private sharedProviderInstances;
    private sharedProviderSymbols;
    private sharedStateStores;
    private secondaryConsumers;
    private readyCallback?;
    setup(_context: FynAppMiddlewareCallContext): Promise<void>;
    /**
     * Check if middleware is ready for specific user requirements
     * This is called after user.initialize() to determine if we can fulfill their needs
     */
    isReadyForUser(userRequirements: any): boolean;
    apply(callContext: FynAppMiddlewareCallContext): Promise<void>;
    private handlePrimaryProvider;
    private handleSecondaryConsumer;
    private validateConfig;
    private normalizeContextsConfig;
    private createContext;
    private updateSecondaryConsumers;
    private createSharedStateStore;
    private exposeContextAPIs;
    cleanup(fynApp: FynApp): void;
    listContexts(fynApp?: FynApp): string[];
}
//# sourceMappingURL=react-context.d.ts.map