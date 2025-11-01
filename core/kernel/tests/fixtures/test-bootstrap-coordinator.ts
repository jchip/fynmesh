/**
 * Test fixture for BootstrapCoordinator
 * Exposes protected methods for testing
 */

import { BootstrapCoordinator } from "../../src/modules/bootstrap-coordinator";
import type { FynApp } from "../../src/types";

export class TestBootstrapCoordinator extends BootstrapCoordinator {
  // Expose protected methods as public for testing
  public areBootstrapDependenciesSatisfied(fynApp: FynApp): boolean {
    return super.areBootstrapDependenciesSatisfied(fynApp);
  }

  public findProviderForMiddleware(middlewareName: string, excludeFynApp: string): string | null {
    return super.findProviderForMiddleware(middlewareName, excludeFynApp);
  }
}
