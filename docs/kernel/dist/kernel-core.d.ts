import { FynEventTarget } from "./event-target";
import { FynMeshKernel, FynMeshRuntimeData, FynApp, FynAppEntry, FynAppMiddlewareReg, FynAppMiddlewareCallContext } from "./types";
/**
 * Abstract base class for FynMesh kernel implementations
 * Contains all platform-agnostic logic
 */
export declare abstract class FynMeshKernelCore implements FynMeshKernel {
    readonly events: FynEventTarget;
    readonly version: string;
    readonly shareScopeName: string;
    protected deferInvoke: {
        callContexts: FynAppMiddlewareCallContext[];
    }[];
    protected runTime: FynMeshRuntimeData;
    protected middlewareReady: Map<string, boolean>;
    constructor();
    /**
     * Send an event to the kernel
     * @param event - event to send
     */
    emitAsync(event: CustomEvent): Promise<boolean>;
    private handleMiddlewareReady;
    /**
     * Register a middleware implementation with enhanced error handling
     */
    registerMiddleware(mwReg: FynAppMiddlewareReg): void;
    /**
     * Get middleware by name and provider
     */
    getMiddleware(name: string, provider?: string): FynAppMiddlewareReg;
    /**
     * Initialize the kernel runtime data
     */
    initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData;
    /**
     * Clean up a container name to ensure it's a valid identifier
     */
    cleanContainerName(name: string): string;
    private loadExposeModule;
    loadFynAppBasics(fynAppEntry: FynAppEntry): Promise<FynApp>;
    private createFynModuleRuntime;
    private invokeFynModule;
    private findExecutionOverride;
    private checkSingleMiddlewareReady;
    private checkMiddlewareReady;
    private checkDeferCalls;
    private callMiddlewares;
    private useMiddlewareOnFynModule;
    private applyAutoScopeMiddlewares;
    /**
     * Bootstrap a fynapp by:
     * - call main as function or invoke it as a FynModule
     */
    bootstrapFynApp(fynApp: FynApp): Promise<void>;
    /**
     * Protected helper to build fynapp URL
     */
    protected buildFynAppUrl(baseUrl: string, entryFile?: string): string;
    abstract loadFynApp(baseUrl: string, loadId?: string): Promise<void>;
}
