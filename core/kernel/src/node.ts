import { nodeKernel } from "./node-kernel";

// Export the Node.js kernel instance
export const fynMeshKernel = nodeKernel;

// Re-export types
export type {
    FynMeshKernel,
    FynMeshRuntimeData,
    FynApp,
    FynAppMiddleware,
} from "./types";

export type { MiddlewareUsage } from "./use-middleware";
export { useMiddleware } from "./use-middleware";

// Re-export kernel classes and creators
export { NodeKernel, createNodeKernel } from "./node-kernel";
export { FynMeshKernelCore } from "./kernel-core";
