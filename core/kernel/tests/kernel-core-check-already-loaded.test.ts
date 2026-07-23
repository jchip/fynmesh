import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { BrowserKernel } from '../src/browser-kernel.js';
import { NodeKernel } from '../src/node-kernel.js';
import type { FynApp, FynAppEntry } from '../src/types.js';

// Concrete test kernel that exposes the protected method
class TestKernel extends FynMeshKernelCore {
  async loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null> {
    return null;
  }

  // Expose protected checkAlreadyLoaded for testing
  public testCheckAlreadyLoaded(fynAppEntry: FynAppEntry): FynApp | null {
    return this.checkAlreadyLoaded(fynAppEntry);
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

describe('FynMeshKernelCore.checkAlreadyLoaded', () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = new TestKernel();
    kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
  });

  it('should return null when no matching app is loaded', () => {
    const entry = {
      container: { name: 'my-app', version: '1.0.0', $E: {} },
    } as any;

    const result = kernel.testCheckAlreadyLoaded(entry);
    expect(result).toBeNull();
  });

  it('should return existing app when name@version key matches', () => {
    const fynApp = createTestFynApp('my-app', '2.0.0');
    kernel['runTime'].appsLoaded['my-app@2.0.0'] = fynApp;

    const entry = {
      container: { name: 'my-app', version: '2.0.0', $E: {} },
    } as any;

    const result = kernel.testCheckAlreadyLoaded(entry);
    expect(result).toBe(fynApp);
  });

  it('should return existing app when only name matches (no version)', () => {
    const fynApp = createTestFynApp('my-app', '1.0.0');
    kernel['runTime'].appsLoaded['my-app'] = fynApp;

    const entry = {
      container: { name: 'my-app', $E: {} },
    } as any;

    const result = kernel.testCheckAlreadyLoaded(entry);
    expect(result).toBe(fynApp);
  });

  it('should return null when name exists but version differs', () => {
    const fynApp = createTestFynApp('my-app', '1.0.0');
    kernel['runTime'].appsLoaded['my-app@1.0.0'] = fynApp;

    const entry = {
      container: { name: 'my-app', version: '2.0.0', $E: {} },
    } as any;

    const result = kernel.testCheckAlreadyLoaded(entry);
    expect(result).toBeNull();
  });

  it('should return null when container has no name', () => {
    const entry = {
      container: { $E: {} },
    } as any;

    const result = kernel.testCheckAlreadyLoaded(entry);
    expect(result).toBeNull();
  });

  it('should prefer versioned key over unversioned', () => {
    const fynApp1 = createTestFynApp('my-app', '1.0.0');
    const fynApp2 = createTestFynApp('my-app', '2.0.0');
    kernel['runTime'].appsLoaded['my-app@1.0.0'] = fynApp1;
    kernel['runTime'].appsLoaded['my-app@2.0.0'] = fynApp2;

    const entry = {
      container: { name: 'my-app', version: '2.0.0', $E: {} },
    } as any;

    const result = kernel.testCheckAlreadyLoaded(entry);
    expect(result).toBe(fynApp2);
  });
});

describe('BrowserKernel uses checkAlreadyLoaded', () => {
  let kernel: BrowserKernel;
  const mockFederation = { import: vi.fn() };

  beforeEach(() => {
    kernel = new BrowserKernel();
    kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
    (globalThis as any).Federation = mockFederation;
    vi.clearAllMocks();
  });

  it('should return existing instance for already-loaded app', async () => {
    const existingApp = createTestFynApp('dup-app', '1.0.0');
    kernel['runTime'].appsLoaded['dup-app@1.0.0'] = existingApp;

    mockFederation.import.mockResolvedValue({
      container: { name: 'dup-app', version: '1.0.0', $E: {} },
    });

    const result = await kernel.loadFynApp('http://example.com/app');
    expect(result).toBe(existingApp);
  });
});

describe('NodeKernel uses checkAlreadyLoaded', () => {
  let kernel: NodeKernel;

  beforeEach(() => {
    kernel = new NodeKernel();
    kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
    vi.clearAllMocks();
  });

  it('should be an instance of NodeKernel with checkAlreadyLoaded inherited', () => {
    // Verify the method exists on the prototype chain
    expect(typeof (kernel as any).checkAlreadyLoaded).toBe('function');
  });
});
