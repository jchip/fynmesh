import { FynModule, FynModuleRuntime } from "@fynmesh/kernel";
/**
 * Standardized middleware user interface
 */
declare class MiddlewareUser implements FynModule {
    /**
     * Tell middleware what we need - called first to determine readiness
     */
    initialize(runtime: FynModuleRuntime): {
        contextId: string;
        isolationLevel: string;
    };
    /**
     * Do our actual work - called when middleware is ready
     */
    execute(runtime: FynModuleRuntime): Promise<void>;
}
export declare const main: MiddlewareUser;
export {};
