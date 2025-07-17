import type { ShareConfig, ShareScope, AddShareOptions, ShareSpec } from './types.js';
/**
 * Federation Container class
 */
export declare class Container {
    /**
     * Original name of the container from developer
     */
    name: string;
    /**
     * ID FederationJS given to the container, derived from name
     */
    id: string;
    /** default scope name for this container */
    scope: string;
    /** share config */
    $SC: ShareConfig;
    /** version of this container */
    version: string;
    /** the share scope object from the federation this container is sharing modules to/from */
    $SS?: ShareScope;
    /** exposed modules */
    $E: Record<string, string>;
    /**
     * The FederationJS runtime
     */
    private Fed;
    /**
     *
     * @param id
     * @param name
     * @param scopeName
     * @param version - version of the container
     * @param federation
     */
    constructor(id: string, name: string, scopeName: string, version?: string, federation?: any);
    /**
     * Gets the version of this container
     * @returns The container version
     */
    getVersion(): string;
    /**
     *
     * @param dep
     * @param declare
     * @param metas
     * @returns
     */
    register(dep: string[], declare: any, metas: any): unknown;
    /**
     * add share
     */
    _S(key: string, options: AddShareOptions, shared: ShareSpec[]): void;
    /**
     * add expose
     */
    _E(key: string, chunkId: any): void;
    /**
     *
     * @param name
     * @returns
     */
    _mfGet(name: string): Promise<() => unknown>;
    /**
     *
     */
    _mfInit(shareScope?: ShareScope): ShareScope | undefined;
}
//# sourceMappingURL=container.d.ts.map