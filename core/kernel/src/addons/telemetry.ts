/**
 * Telemetry add-on: adds `kernel.setTelemetry(config)`, which starts recording
 * kernel telemetry into a ring buffer flushed to `config.transport`.
 */

import type { FynMeshKernel, KernelAddon, KernelHooks, TelemetryKernelApi } from "../types";
import { KernelTelemetryImpl } from "../kernel-telemetry";

function install(kernel: FynMeshKernel, hooks: KernelHooks): void {
  (kernel as FynMeshKernel & TelemetryKernelApi).setTelemetry = (config) => {
    hooks.setTel(new KernelTelemetryImpl(config));
  };
}

export const telemetryAddon: KernelAddon = { name: "telemetry", install };
