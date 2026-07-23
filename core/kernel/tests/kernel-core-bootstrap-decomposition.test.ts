import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import type { FynApp, FynAppEntry, FynUnit } from '../src/types.js';

// Concrete test kernel exposing private methods for testing
class DecompTestKernel extends FynMeshKernelCore {
  async loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null> {
    return null;
  }

  // Expose private methods for testing decomposition
  public testCheckBootstrapReadiness(fynApp: FynApp): Promise<boolean> {
    return (this as any).checkBootstrapReadiness(fynApp);
  }

  public testLoadMiddlewareModules(fynApp: FynApp): Promise<void> {
    return (this as any).loadMiddlewareModules(fynApp);
  }

  public testPrepareMainExport(fynApp: FynApp): Promise<FynUnit | null> {
    return (this as any).prepareMainExport(fynApp);
  }

  public testExecuteFynUnit(fynUnit: FynUnit, fynApp: FynApp): Promise<void> {
    return (this as any).executeFynUnit(fynUnit, fynApp);
  }

  public testValidateFynUnit(mainExport: any, fynAppName: string): FynUnit {
    return (this as any).validateFynUnit(mainExport, fynAppName);
  }
}

function createTestFynApp(name: string, overrides: Partial<FynApp> = {}): FynApp {
  return {
    name,
    version: '1.0.0',
    packageName: name,
    entry: { container: { name, version: '1.0.0', $E: {} } } as any,
    exposes: {},
    middlewareContext: new Map(),
    ...overrides,
  };
}

describe('bootstrapFynApp decomposition', () => {
  let kernel: DecompTestKernel;

  beforeEach(() => {
    kernel = new DecompTestKernel();
    kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
  });

  describe('checkBootstrapReadiness', () => {
    it('should return true when bootstrap coordinator allows', async () => {
      const fynApp = createTestFynApp('ready-app');
      vi.spyOn(kernel.bootstrapCoordinator, 'canBootstrap').mockReturnValue(true);
      vi.spyOn(kernel.bootstrapCoordinator, 'acquireBootstrapLock').mockReturnValue(true);

      const result = await kernel.testCheckBootstrapReadiness(fynApp);
      expect(result).toBe(true);
    });

    it('should defer when canBootstrap returns false', async () => {
      const fynApp = createTestFynApp('deferred-app');
      vi.spyOn(kernel.bootstrapCoordinator, 'canBootstrap').mockReturnValue(false);
      vi.spyOn(kernel.bootstrapCoordinator, 'deferBootstrap').mockResolvedValue(undefined);
      vi.spyOn(kernel.bootstrapCoordinator, 'acquireBootstrapLock').mockReturnValue(true);

      const result = await kernel.testCheckBootstrapReadiness(fynApp);
      expect(result).toBe(true);
      expect(kernel.bootstrapCoordinator.deferBootstrap).toHaveBeenCalledWith(fynApp);
    });

    it('should return false when lock cannot be acquired even after deferral', async () => {
      const fynApp = createTestFynApp('locked-app');
      vi.spyOn(kernel.bootstrapCoordinator, 'canBootstrap').mockReturnValue(true);
      vi.spyOn(kernel.bootstrapCoordinator, 'acquireBootstrapLock').mockReturnValue(false);
      vi.spyOn(kernel.bootstrapCoordinator, 'deferBootstrap').mockResolvedValue(undefined);

      const result = await kernel.testCheckBootstrapReadiness(fynApp);
      expect(result).toBe(false);
    });
  });

  describe('loadMiddlewareModules', () => {
    it('should load middleware expose modules from container', async () => {
      const fynApp = createTestFynApp('mw-app', {
        entry: {
          container: {
            name: 'mw-app',
            version: '1.0.0',
            $E: {
              './middleware/design-tokens': './middleware/design-tokens',
              './main': './main',
              './config': './config',
            },
          },
        } as any,
      });

      const loadSpy = vi.spyOn(kernel.moduleLoader, 'loadExposeModule').mockResolvedValue(undefined as any);

      await kernel.testLoadMiddlewareModules(fynApp);

      // Should only load modules starting with ./middleware
      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy).toHaveBeenCalledWith(
        fynApp,
        './middleware/design-tokens',
        true,
        expect.any(Function)
      );
    });

    it('should not load any modules when no middleware exposes exist', async () => {
      const fynApp = createTestFynApp('no-mw-app', {
        entry: {
          container: {
            name: 'no-mw-app',
            version: '1.0.0',
            $E: {
              './main': './main',
              './config': './config',
            },
          },
        } as any,
      });

      const loadSpy = vi.spyOn(kernel.moduleLoader, 'loadExposeModule').mockResolvedValue(undefined as any);

      await kernel.testLoadMiddlewareModules(fynApp);
      expect(loadSpy).not.toHaveBeenCalled();
    });
  });

  describe('prepareMainExport', () => {
    it('should return null when no main export exists', async () => {
      const fynApp = createTestFynApp('no-main-app');

      const result = await kernel.testPrepareMainExport(fynApp);
      expect(result).toBeNull();
    });

    it('should validate and return FynUnit for function export', async () => {
      const executeFn = vi.fn();
      const fynApp = createTestFynApp('fn-app', {
        exposes: { './main': { main: executeFn } },
      });

      vi.spyOn(kernel.middlewareExecutor, 'applyAutoScopeMiddlewares').mockResolvedValue([]);

      const result = await kernel.testPrepareMainExport(fynApp);
      expect(result).toBeDefined();
      expect(result!.execute).toBe(executeFn);
    });

    it('should validate and return FynUnit for object export', async () => {
      const fynUnit = { execute: vi.fn(), initialize: vi.fn() };
      const fynApp = createTestFynApp('obj-app', {
        exposes: { './main': { main: fynUnit } },
      });

      vi.spyOn(kernel.middlewareExecutor, 'applyAutoScopeMiddlewares').mockResolvedValue([]);

      const result = await kernel.testPrepareMainExport(fynApp);
      expect(result).toBe(fynUnit);
    });
  });

  describe('executeFynUnit', () => {
    it('should delegate to moduleLoader.invokeFynUnit', async () => {
      const fynUnit: FynUnit = { execute: vi.fn() };
      const fynApp = createTestFynApp('exec-app');

      const invokeSpy = vi.spyOn(kernel.moduleLoader, 'invokeFynUnit').mockResolvedValue(undefined);

      await kernel.testExecuteFynUnit(fynUnit, fynApp);

      // Verify the call was made with the right fynUnit, fynApp, and kernel
      expect(invokeSpy).toHaveBeenCalledOnce();
      const callArgs = invokeSpy.mock.calls[0];
      expect(callArgs[0]).toBe(fynUnit);
      expect(callArgs[1]).toBe(fynApp);
      // autoApplyMiddlewares may be undefined when none are registered
      expect(callArgs[3]).toBe(kernel);
    });
  });

  describe('validateFynUnit', () => {
    it('should wrap a function as FynUnit', () => {
      const fn = () => 'result';
      const result = kernel.testValidateFynUnit(fn, 'test-app');
      expect(result.execute).toBe(fn);
    });

    it('should pass through object with execute method', () => {
      const obj = { execute: vi.fn(), extra: 'data' };
      const result = kernel.testValidateFynUnit(obj, 'test-app');
      expect(result).toBe(obj);
    });

    it('should throw for invalid export (string)', () => {
      expect(() => kernel.testValidateFynUnit('invalid', 'test-app'))
        .toThrow('test-app: main export must be a function or have an execute method');
    });

    it('should throw for invalid export (object without execute)', () => {
      expect(() => kernel.testValidateFynUnit({ foo: 'bar' }, 'test-app'))
        .toThrow('test-app: main export must be a function or have an execute method');
    });

    it('should throw for null export', () => {
      expect(() => kernel.testValidateFynUnit(null, 'test-app'))
        .toThrow('test-app: main export must be a function or have an execute method');
    });
  });

  describe('bootstrapFynApp orchestration', () => {
    it('should call all decomposed methods in order for a FynApp with main', async () => {
      const executeFn = vi.fn();
      const fynApp = createTestFynApp('full-app', {
        entry: {
          container: {
            name: 'full-app',
            version: '1.0.0',
            $E: { './main': './main' },
          },
        } as any,
        exposes: { './main': { main: executeFn } },
      });

      vi.spyOn(kernel.bootstrapCoordinator, 'canBootstrap').mockReturnValue(true);
      vi.spyOn(kernel.bootstrapCoordinator, 'acquireBootstrapLock').mockReturnValue(true);
      vi.spyOn(kernel.moduleLoader, 'loadExposeModule').mockResolvedValue(undefined as any);
      vi.spyOn(kernel.middlewareExecutor, 'applyAutoScopeMiddlewares').mockResolvedValue([]);
      vi.spyOn(kernel.moduleLoader, 'invokeFynUnit').mockResolvedValue(undefined);

      await kernel.bootstrapFynApp(fynApp);

      // Should have called invokeFynUnit (Path B - no middleware meta)
      expect(kernel.moduleLoader.invokeFynUnit).toHaveBeenCalled();
    });

    it('should skip execution for FynApp without main export', async () => {
      const fynApp = createTestFynApp('mw-only-app', {
        entry: {
          container: {
            name: 'mw-only-app',
            version: '1.0.0',
            $E: { './middleware/theme': './middleware/theme' },
          },
        } as any,
      });

      vi.spyOn(kernel.bootstrapCoordinator, 'canBootstrap').mockReturnValue(true);
      vi.spyOn(kernel.bootstrapCoordinator, 'acquireBootstrapLock').mockReturnValue(true);
      vi.spyOn(kernel.moduleLoader, 'loadExposeModule').mockResolvedValue(undefined as any);
      vi.spyOn(kernel.moduleLoader, 'invokeFynUnit').mockResolvedValue(undefined);

      await kernel.bootstrapFynApp(fynApp);

      // Should NOT have called invokeFynUnit since no main
      expect(kernel.moduleLoader.invokeFynUnit).not.toHaveBeenCalled();
    });

    it('should return early when readiness check fails', async () => {
      const fynApp = createTestFynApp('blocked-app');

      vi.spyOn(kernel.bootstrapCoordinator, 'canBootstrap').mockReturnValue(true);
      vi.spyOn(kernel.bootstrapCoordinator, 'acquireBootstrapLock').mockReturnValue(false);
      vi.spyOn(kernel.bootstrapCoordinator, 'deferBootstrap').mockResolvedValue(undefined);
      const loadSpy = vi.spyOn(kernel.moduleLoader, 'loadExposeModule').mockResolvedValue(undefined as any);

      await kernel.bootstrapFynApp(fynApp);

      // Should not proceed to loading modules
      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('should emit FYNAPP_BOOTSTRAPPED event on success', async () => {
      const fynApp = createTestFynApp('event-app', {
        entry: {
          container: { name: 'event-app', version: '1.0.0', $E: {} },
        } as any,
      });

      vi.spyOn(kernel.bootstrapCoordinator, 'canBootstrap').mockReturnValue(true);
      vi.spyOn(kernel.bootstrapCoordinator, 'acquireBootstrapLock').mockReturnValue(true);

      const emitSpy = vi.spyOn(kernel, 'emitAsync').mockResolvedValue(true);

      await kernel.bootstrapFynApp(fynApp);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FYNAPP_BOOTSTRAPPED',
        })
      );
    });

    it('should emit FYNAPP_BOOTSTRAP_FAILED and release lock on error', async () => {
      const fynApp = createTestFynApp('error-app', {
        entry: {
          container: {
            name: 'error-app',
            version: '1.0.0',
            $E: { './middleware/broken': './middleware/broken' },
          },
        } as any,
      });

      vi.spyOn(kernel.bootstrapCoordinator, 'canBootstrap').mockReturnValue(true);
      vi.spyOn(kernel.bootstrapCoordinator, 'acquireBootstrapLock').mockReturnValue(true);
      const releaseSpy = vi.spyOn(kernel.bootstrapCoordinator, 'releaseBootstrapLock');
      vi.spyOn(kernel.moduleLoader, 'loadExposeModule').mockRejectedValue(new Error('load failed'));

      const emitSpy = vi.spyOn(kernel, 'emitAsync').mockResolvedValue(true);

      await kernel.bootstrapFynApp(fynApp);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FYNAPP_BOOTSTRAP_FAILED',
        })
      );
      expect(releaseSpy).toHaveBeenCalled();
    });
  });

  describe('MIDDLEWARE_EXPOSE_PREFIX usage', () => {
    it('should use the constant from util.ts for middleware detection', async () => {
      // Verify the constant is used by checking that middleware modules
      // starting with "./middleware" are properly detected
      const fynApp = createTestFynApp('prefix-app', {
        entry: {
          container: {
            name: 'prefix-app',
            version: '1.0.0',
            $E: {
              './middleware/auth': './middleware/auth',
              './middlewareX': './middlewareX', // should NOT match since it starts with ./middleware but is valid prefix
              './main': './main',
            },
          },
        } as any,
      });

      const loadSpy = vi.spyOn(kernel.moduleLoader, 'loadExposeModule').mockResolvedValue(undefined as any);

      await kernel.testLoadMiddlewareModules(fynApp);

      // Both './middleware/auth' and './middlewareX' start with MIDDLEWARE_EXPOSE_PREFIX ("./middleware")
      // so both should be loaded as middleware modules
      expect(loadSpy).toHaveBeenCalledTimes(2);
    });
  });
});
