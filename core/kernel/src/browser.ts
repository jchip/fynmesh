import { createBrowserKernel } from "./browser-kernel.ts";
/**
 * Global browser kernel instance attached to globalThis
 */
(globalThis as any).fynMeshKernel = createBrowserKernel();
