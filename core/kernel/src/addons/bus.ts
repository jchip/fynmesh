/**
 * FynBus add-on: inter-FynApp messaging (see notes/FYNBUS_DESIGN.md).
 * Adds `kernel.bus` and a per-app `runtime.bus`, separate from `kernel.events`,
 * which stays lifecycle-only.
 */

import type { BusKernelApi, FynMeshKernel, KernelAddon, KernelHooks } from "../types";
import { FynBusRoot } from "../fyn-bus";

function install(kernel: FynMeshKernel, hooks: KernelHooks): void {
  const busRoot = new FynBusRoot(hooks.tel.scope("bus"));
  // Kept on the kernel for tests; only this bundle reads it
  const k = kernel as FynMeshKernel & BusKernelApi & { busRoot: FynBusRoot };
  k.busRoot = busRoot;
  k.bus = busRoot.forKernel();

  hooks.runtime.push((fynApp, runtime) => {
    runtime.bus = busRoot.forApp(fynApp.name, fynApp.version);
  });

  // Drop the app's subscriptions and handlers; a later re-bootstrap gets a
  // fresh facade (FYM-140)
  hooks.appGone.push((fynApp) => busRoot.disposeApp(fynApp.name, fynApp.version));
}

export const busAddon: KernelAddon = { name: "bus", install };
