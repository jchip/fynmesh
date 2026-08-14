import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import type { FynApp } from '../src/types.js';

// Concrete test kernel
class TestKernel extends FynMeshKernelCore {
  async loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null> {
    return null;
  }

  // Expose private removeFromRegistry for testing
  public testRemoveFromRegistry(fynApp: FynApp, name: string): void {
    return (this as any).removeFromRegistry(fynApp, name);
  }
}

function createTestFynApp(name: string, version: string): FynApp {
  return {
    name,
    version,
    packageName: name,
    entry: { container: { name, version, $E: {} } } as any,
    exposes: {},
    middlewareContext: new Map(),
  };
}

describe('FynMeshKernelCore.removeFromRegistry', () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = new TestKernel();
    kernel.initRunTime({ apps: {}, middlewares: {} });
  });

  it('should remove by lookup name, versioned key, and canonical name', () => {
    const fynApp = createTestFynApp('my-app', '2.0.0');
    const rt = kernel['runTime'];
    rt.apps['my-app'] = fynApp;
    rt.apps['my-app@2.0.0'] = fynApp;

    kernel.testRemoveFromRegistry(fynApp, 'my-app');

    expect(rt.apps['my-app']).toBeUndefined();
    expect(rt.apps['my-app@2.0.0']).toBeUndefined();
  });

  it('should remove when lookup name differs from canonical name', () => {
    const fynApp = createTestFynApp('my-app', '1.0.0');
    const rt = kernel['runTime'];
    // Could be looked up by versioned key
    rt.apps['my-app@1.0.0'] = fynApp;
    rt.apps['my-app'] = fynApp;

    kernel.testRemoveFromRegistry(fynApp, 'my-app@1.0.0');

    expect(rt.apps['my-app@1.0.0']).toBeUndefined();
    expect(rt.apps['my-app']).toBeUndefined();
  });

  it('should handle case where some keys do not exist in registry', () => {
    const fynApp = createTestFynApp('partial-app', '3.0.0');
    const rt = kernel['runTime'];
    // Only canonical name exists
    rt.apps['partial-app'] = fynApp;

    // Should not throw
    expect(() => kernel.testRemoveFromRegistry(fynApp, 'partial-app')).not.toThrow();

    expect(rt.apps['partial-app']).toBeUndefined();
    expect(rt.apps['partial-app@3.0.0']).toBeUndefined();
  });

  it('should not affect other apps in the registry', () => {
    const fynApp1 = createTestFynApp('app-a', '1.0.0');
    const fynApp2 = createTestFynApp('app-b', '2.0.0');
    const rt = kernel['runTime'];
    rt.apps['app-a'] = fynApp1;
    rt.apps['app-a@1.0.0'] = fynApp1;
    rt.apps['app-b'] = fynApp2;
    rt.apps['app-b@2.0.0'] = fynApp2;

    kernel.testRemoveFromRegistry(fynApp1, 'app-a');

    expect(rt.apps['app-a']).toBeUndefined();
    expect(rt.apps['app-a@1.0.0']).toBeUndefined();
    expect(rt.apps['app-b']).toBe(fynApp2);
    expect(rt.apps['app-b@2.0.0']).toBe(fynApp2);
  });

  it('should be used by shutdownFynApp on successful shutdown', async () => {
    const fynApp = createTestFynApp('shutdown-app', '1.0.0');
    fynApp.exposes = {};
    const rt = kernel['runTime'];
    rt.apps['shutdown-app'] = fynApp;
    rt.apps['shutdown-app@1.0.0'] = fynApp;

    const result = await kernel.shutdownFynApp('shutdown-app');

    expect(result).toBe(true);
    expect(rt.apps['shutdown-app']).toBeUndefined();
    expect(rt.apps['shutdown-app@1.0.0']).toBeUndefined();
  });

  it('should be used by shutdownFynApp even when shutdown throws', async () => {
    const fynApp = createTestFynApp('failing-app', '1.0.0');
    fynApp.exposes = {
      './main': {
        main: {
          execute: vi.fn(),
          shutdown: vi.fn().mockRejectedValue(new Error('shutdown failed')),
        },
      },
    };
    const rt = kernel['runTime'];
    rt.apps['failing-app'] = fynApp;
    rt.apps['failing-app@1.0.0'] = fynApp;

    const result = await kernel.shutdownFynApp('failing-app');

    // Should return false on error but still remove from registry
    expect(result).toBe(false);
    expect(rt.apps['failing-app']).toBeUndefined();
    expect(rt.apps['failing-app@1.0.0']).toBeUndefined();
  });
});
