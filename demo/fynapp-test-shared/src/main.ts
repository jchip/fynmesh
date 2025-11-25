import type { FynUnitRuntime } from "@fynmesh/kernel";
import type { NoRenderResult } from "fynapp-shell-mw/middleware/shell-layout";

/**
 * Test FynApp that imports a consume-only shared module with no provider.
 *
 * This tests the federation-js shared module detection:
 * When this fynapp tries to import "nonexistent-shared-lib", the federation
 * runtime should detect it's a bare specifier that matches a consume-only
 * shared module in this container's $SC, and throw SharedModuleNoProviderError.
 */

const middlewareUser = {
  initialize(runtime: FynUnitRuntime) {
    console.debug(`[fynapp-test-shared] initialize called`);
    return {
      status: "ready",
      mode: "provider",
    };
  },

  async execute(runtime: FynUnitRuntime): Promise<NoRenderResult | void> {
    console.debug("[fynapp-test-shared] execute - about to import shared module");

    const targetElement = document.getElementById('fynapp-test-shared');

    try {
      // This import should trigger SharedModuleNoProviderError
      // because "nonexistent-shared-lib" is declared as shared with import: false
      // but no other container provides it
      const sharedLib = await import("nonexistent-shared-lib");

      // If we get here, the test failed - should have thrown
      console.error("[fynapp-test-shared] ERROR: Import succeeded but should have failed!");

      if (targetElement) {
        targetElement.innerHTML = `
          <div style="padding: 1rem; color: red; background: #fee;">
            <strong>TEST FAILED:</strong> Import of nonexistent-shared-lib succeeded but should have thrown SharedModuleNoProviderError
          </div>
        `;
      }
    } catch (error: any) {
      // Expected: SharedModuleNoProviderError
      console.log("[fynapp-test-shared] Caught expected error:", error);

      const isExpectedError = error.name === 'SharedModuleNoProviderError' ||
                              error.message?.includes('no provider loaded');

      if (targetElement) {
        if (isExpectedError) {
          targetElement.innerHTML = `
            <div style="padding: 1rem; color: green; background: #efe;">
              <strong>TEST PASSED:</strong> SharedModuleNoProviderError correctly thrown!<br/>
              <pre style="margin-top: 0.5rem; font-size: 0.8rem; white-space: pre-wrap;">${error.message}</pre>
            </div>
          `;
        } else {
          targetElement.innerHTML = `
            <div style="padding: 1rem; color: orange; background: #ffe;">
              <strong>UNEXPECTED ERROR:</strong> Got error but not SharedModuleNoProviderError<br/>
              <pre style="margin-top: 0.5rem; font-size: 0.8rem; white-space: pre-wrap;">${error.name}: ${error.message}</pre>
            </div>
          `;
        }
      }
    }

    return {
      type: 'no-render',
      message: 'Test completed',
      metadata: {
        framework: 'vanilla',
        version: '1.0.0',
        capabilities: []
      }
    };
  },
};

export const main = middlewareUser;
