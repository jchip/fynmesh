import { browserKernel } from "./browser-kernel";

// Export the browser kernel instance
export const fynMeshKernel = browserKernel;

// Re-export types
export type { FynMeshKernel, FynMeshRuntimeData, FynApp, FynAppMiddleware } from "./types";

export { useMiddleware } from "./use-middleware";

// Re-export kernel classes and creators
export { BrowserKernel, createBrowserKernel } from "./browser-kernel";
export { FynMeshKernelCore } from "./kernel-core";
