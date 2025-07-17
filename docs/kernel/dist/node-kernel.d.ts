import { FynMeshKernelCore } from "./kernel-core";
/**
 * Node.js-specific implementation of FynMesh kernel
 * Handles Node.js-specific module loading and federation
 */
export declare class NodeKernel extends FynMeshKernelCore {
    /**
     * Load a remote fynapp in Node.js environment
     */
    loadFynApp(baseUrl: string, loadId?: string): Promise<void>;
}
/**
 * Create and initialize a Node.js kernel instance
 */
export declare function createNodeKernel(): NodeKernel;
