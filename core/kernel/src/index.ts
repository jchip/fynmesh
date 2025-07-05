/**
 * fynmesh kernel
 * Core runtime for the fynmesh microfrontend framework
 */

// Export types
export * from "./types";

// Export core components
export { FynMeshKernelCore } from "./kernel-core";
export { BrowserKernel, createBrowserKernel } from "./browser-kernel";
export { NodeKernel, createNodeKernel } from "./node-kernel";
export * from "./use-middleware.ts";
