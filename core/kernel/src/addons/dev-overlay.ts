/**
 * Dev overlay add-on: shows FynApp bootstrap failures on the page.
 */

import type { KernelAddon } from "../types";
import { installDevErrorOverlay } from "../dev-error-overlay";

export const devOverlayAddon: KernelAddon = {
  name: "dev-overlay",
  install(kernel) {
    installDevErrorOverlay(kernel.events);
  },
};
