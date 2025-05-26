import { FynEventTarget } from "./event-target";
import { fynMeshShareScope } from "./share-scope";
import {
    FynAppInfo,
    FynMeshKernel,
    FynAppMiddleware,
    FynMeshRuntimeData,
    FynApp,
} from "./types";
import type { FederationEntry } from "federation-js";
import { urlJoin } from "./util";

/**
 * Extended runtime data interface for internal use
 */
export interface KernelRuntimeData extends FynMeshRuntimeData {
    shareScope: Record<string, any>;
}

/**
 * Abstract base class for FynMesh kernel implementations
 * Contains all platform-agnostic logic
 */
export abstract class FynMeshKernelCore implements FynMeshKernel {
    public readonly events: FynEventTarget;
    public readonly version: string = "1.0.0";
    public readonly shareScopeName: string = fynMeshShareScope;

    protected runTime: KernelRuntimeData;

    constructor() {
        this.events = new FynEventTarget();
        this.runTime = {
            appsLoaded: {},
            middlewares: {},
            shareScope: Object.create(null),
        };
    }

    /**
     * Initialize the kernel runtime data
     */
    initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData {
        this.runTime = {
            ...data,
            shareScope: this.runTime.shareScope, // Preserve existing shareScope
        };
        return this.runTime;
    }

    /**
     * Clean up a container name to ensure it's a valid identifier
     */
    cleanContainerName(name: string): string {
        return name.replace(/[\@\-./]/g, "_").replace(/^_*/, "");
    }



    /**
     * Bootstrap a single fynapp entry through the complete lifecycle
     */
    async bootstrapSingleEntry(fynAppEntry: FederationEntry): Promise<void> {
        // Step 1: Initialize the entry
        fynAppEntry.init();
        const container = fynAppEntry.container;

        // Step 2: Load and execute config module if present
        if (container && container.$E["./config"]) {
            console.debug('fynMeshKernel loading fynapp config', fynAppEntry);
            const factory = await fynAppEntry.get("./config");
            factory().configure(this, fynAppEntry);
        }

        // Step 3: Load and register middlewares if present
        await this.loadEntryMiddlewares(fynAppEntry);

        // Step 4: Load and execute main module if present
        if (container && container.$E["./main"]) {
            console.debug('fynMeshKernel loading fynapp main', fynAppEntry);
            const factory = await fynAppEntry.get("./main");
            const mainModule = factory();

            // Store the main module for potential middleware access
            if (mainModule && typeof mainModule === 'object') {
                // Create a FynApp object for middleware compatibility
                const fynApp: FynApp = {
                    name: this.extractAppName(fynAppEntry),
                    version: "1.0.0", // Default version
                    mainModule: mainModule,
                };

                // Apply middlewares to the fynapp
                await this.applyMiddlewares(fynApp);

                // Call main if it exists
                if (mainModule.main) {
                    mainModule.main(this, fynAppEntry);
                }
            }
        }

        console.debug('fynMeshKernel completed fynapp bootstrap', fynAppEntry);
    }

    /**
    * Load middlewares from a fynapp entry
    */
    async loadEntryMiddlewares(fynAppEntry: FederationEntry): Promise<void> {
        const container = fynAppEntry.container;
        if (!container || !container.$E) return;

        // Look for middleware exports (modules starting with __middleware)
        for (const moduleName in container.$E) {
            if (moduleName.startsWith('__middleware')) {
                try {
                    const factory = await fynAppEntry.get(moduleName);
                    const middleware: FynAppMiddleware = factory();

                    if (middleware && middleware.setup) {
                        await middleware.setup(this);
                    }

                    // Extract middleware name from module name
                    const middlewareName = moduleName.replace('__middleware', '').toLowerCase();
                    const appName = this.extractAppName(fynAppEntry);

                    this.runTime.middlewares[`${appName}/${middlewareName}`] = {
                        fynApp: {
                            name: appName,
                            version: "1.0.0",
                        } as FynApp,
                        config: {},
                        moduleName,
                        exportName: moduleName,
                        implementation: middleware,
                    };

                    console.debug('fynMeshKernel loaded middleware', middlewareName, 'from', appName);
                } catch (error) {
                    console.error('Failed to load middleware', moduleName, error);
                }
            }
        }
    }

    /**
     * Extract app name from federation entry
     */
    private extractAppName(fynAppEntry: FederationEntry): string {
        return fynAppEntry.container.name;
    }

    /**
     * Bootstrap fynapps - handles both federation entries and legacy app info
     */
    async bootstrapFynApp(appsInfo: FynAppInfo[]): Promise<void> {
        if (appsInfo.length <= 0) {
            return;
        }

        // Separate federation entries from legacy apps
        const federationApps = appsInfo.filter(appInfo => appInfo.entry);

        // Process federation entries first
        for (const appInfo of federationApps) {
            await this.bootstrapSingleEntry(appInfo.entry!);
        }
    }



    /**
     * Apply middlewares to a fynapp
     */
    async applyMiddlewares(fynApp: FynApp): Promise<void> {
        const { runTime } = this;
        const { middlewares } = runTime;

        for (const capId in middlewares) {
            const middleware = middlewares[capId];
            if (middleware.implementation?.apply) {
                await middleware.implementation.apply(fynApp);
            }
        }
    }

    /**
     * Protected helper to build fynapp URL
     */
    protected buildFynAppUrl(baseUrl: string, entryFile: string = 'fynapp-entry.js'): string {
        return urlJoin(baseUrl, entryFile);
    }

    // Abstract methods that must be implemented by platform-specific classes
    abstract loadFynApp(baseUrl: string, loadId?: string): Promise<void>;
}
