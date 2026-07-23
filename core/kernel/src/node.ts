import { createNodeKernel } from "./node-kernel.ts";

/**
 * Global Node.js kernel instance attached to globalThis
 */
export const fynMeshKernel = createNodeKernel();
