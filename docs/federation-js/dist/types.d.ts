/**
 * TypeScript types and interfaces for federation-js
 */
import type { Container } from "./container.js";
export interface ShareSource {
    id: string;
    /** container name */
    container: string;
    /** container version */
    version: string;
    loaded?: boolean;
}
export interface ShareInfo {
    sources: ShareSource[];
    /**
     * url of the file that provided the shared module.
     * Having this url means someone has provided a copy of the shared
     * module, and it's loaded from the url.
     */
    url?: string;
    /**
     * id of the chunk that provided the shared module
     * Having this means a copy of the shared module is available, provided
     * by the chunk of the id.
     */
    id?: string;
    srcIdx?: number;
}
export type ShareMeta = Record<string, ShareInfo>;
export type ShareScope = Record<string, ShareMeta>;
/**
 * {
 *   [scope name]: { // ShareScope
 *     [share key]: { // ShareMeta
 *       [version]: {  // ShareInfo
 *         sources: [{id: "", container: ""}],
 *         url: "",
 *         srcIdx: 0
 *       }
 *     }
 *   }
 * }
 */
export type ShareStore = Record<string, ShareScope>;
/**
 * {
 *   [share key]: {
 *     options: {},
 *     rvm: {},
 *     versions: {
 *       [version]: {
 *         id: ""
 *       }
 *     }
 *   }
 * }
 */
export interface ShareConfig {
    [key: string]: {
        options: Record<string, any>;
        /**
         * required version mapping
         * Map from importer's dir to the version they required from the
         * nearest package.json dependencies.
         */
        rvm: {
            [importerDir: string]: string;
        };
        versions: {
            [version: string]: {
                id: string;
            };
        };
    };
}
/**
 * Add share options
 */
export interface AddShareOptions {
    singleton?: boolean;
    requiredVersion?: string;
    eager?: boolean;
    import?: string | boolean;
    shareScope?: string;
}
export type ShareSpec = [spec: {
    id: string;
} & string, ver: string][];
export interface MFBinding {
    name: string;
    id?: string;
    /**
     * name of the script that created the module bind
     */
    src?: string;
    fileName: string;
    container: string;
    containerVersion?: string;
    scopeName: string;
    mapData: string[];
    register: (dep: any, declare: any, metas: any) => unknown;
    _register: (id: any, deps: any, declare: any, metas: any, src: any) => unknown;
}
export interface BindOptions {
    /** chunk name */
    n: string;
    /** chunk filename */
    f: string;
    /** federation container name */
    c: string;
    /** default scope name */
    s: string;
    /** isEntry */
    e: boolean;
    /** container version */
    v?: string;
}
export interface RegDef {
    url: string;
    def?: unknown;
}
export type ModuleFactory = () => any;
/**
 * Federation entry module interface
 * Represents the federation entry module that exports init, get, and container
 * This is what gets returned from Federation.import() or dynamic import()
 */
export interface FederationEntry {
    /** Initialize the container */
    init(): void;
    /** Get a module from the container */
    get(moduleName: string): Promise<ModuleFactory>;
    /** The actual federation container object */
    container: Container;
    config?: any;
}
//# sourceMappingURL=types.d.ts.map