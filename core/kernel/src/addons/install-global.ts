import type { KernelAddon } from "../types";

/**
 * Install an add-on into the page's kernel. Each add-on bundle runs this, so
 * the core kernel bundle must load first.
 */
export function installGlobal(addon: KernelAddon): void {
  const kernel = (globalThis as any).fynMeshKernel;
  if (!kernel?.use) {
    throw new Error(
      `FynMesh add-on "${addon.name}" loaded before the kernel: load the core kernel bundle first`,
    );
  }
  kernel.use(addon);
}
