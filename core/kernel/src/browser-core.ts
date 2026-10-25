import { createBrowserKernel } from "./browser-kernel.ts";

/**
 * Core-only browser kernel. Add-on bundles load after it and install
 * themselves.
 */
(globalThis as any).fynMeshKernel = createBrowserKernel();
