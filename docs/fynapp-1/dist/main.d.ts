import type { FynModuleRuntime, ComponentFactoryResult, SelfManagedResult, NoRenderResult } from "@fynmesh/kernel";
export declare const main: {
    /**
     * Tell middleware what we need - called first to determine readiness
     */
    initialize(runtime: FynModuleRuntime): {
        status: string;
        mode: string;
    };
    /**
     * Main function - called when middleware is ready
     */
    execute(runtime: FynModuleRuntime): Promise<ComponentFactoryResult | SelfManagedResult | NoRenderResult | void>;
};
