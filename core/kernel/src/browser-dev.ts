import { createBrowserKernel } from "./browser-kernel.ts";
import { allAddons, devOverlayAddon } from "./addons/index.ts";

/**
 * Global development browser kernel with every add-on and the bootstrap error
 * overlay.
 */
const kernel = createBrowserKernel();
[...allAddons, devOverlayAddon].forEach((addon) => kernel.use(addon));
(globalThis as any).fynMeshKernel = kernel;
