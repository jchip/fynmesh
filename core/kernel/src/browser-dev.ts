import { createBrowserKernel } from "./browser-kernel.ts";
import { installDevErrorOverlay } from "./dev-error-overlay.ts";

/**
 * Global development browser kernel with the bootstrap error overlay enabled.
 */
const kernel = createBrowserKernel();
(globalThis as any).fynMeshKernel = kernel;
installDevErrorOverlay(kernel.events);
