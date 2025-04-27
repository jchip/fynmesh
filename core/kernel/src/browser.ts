import { FynMeshKernel } from "./types";

// Export the kernel from globalThis
export const fynMeshKernel = globalThis.fynMeshKernel as FynMeshKernel;

// Re-export types
export type {
    FynMeshKernel,
    FynMeshRuntimeData,
    FynApp,
    FynAppMiddleware,
    MFRemoteContainer,
} from "./types";

export type { MiddlewareUsage } from "./use-middleware";
export { useMiddleware } from "./use-middleware";