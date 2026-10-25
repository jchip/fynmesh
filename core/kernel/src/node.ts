import { createNodeKernel } from "./node-kernel.ts";
import { allAddons } from "./addons/index.ts";

/**
 * Global Node.js kernel instance with every add-on
 */
export const fynMeshKernel = createNodeKernel();
allAddons.forEach((addon) => fynMeshKernel.use(addon));
