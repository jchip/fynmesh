import { createBrowserKernel } from "./browser-kernel.ts";
import { allAddons } from "./addons/index.ts";

/**
 * Global browser kernel with every add-on, attached to globalThis
 */
const kernel = createBrowserKernel();
allAddons.forEach((addon) => kernel.use(addon));
(globalThis as any).fynMeshKernel = kernel;
