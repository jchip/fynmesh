import type { KernelAddon } from "../types";
import { middlewareAddon } from "./middleware";
import { busAddon } from "./bus";
import { telemetryAddon } from "./telemetry";

export { middlewareAddon, busAddon, telemetryAddon };
export { devOverlayAddon } from "./dev-overlay";

/** Every add-on a full kernel bundle carries, the dev overlay aside. */
export const allAddons: KernelAddon[] = [middlewareAddon, busAddon, telemetryAddon];
