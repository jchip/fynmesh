import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry, FynApp, FynModule, FynAppMiddleware, FynAppMiddlewareReg } from '../src/types.js';

// Test kernel that exposes protected methods for testing
class UniversalMiddlewareTestKernel extends FynMeshKernelCore {
    async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
        // Mock implementation for abstract method
    }

    // Expose protected method for testing
    public async testApplyAutoScopeMiddlewares(fynApp: FynApp, fynModule?: FynModule): Promise<void> {
        const autoApplyMiddlewares = this.middlewareManager.getAutoApplyMiddlewares();
        await this.middlewareExecutor.applyAutoScopeMiddlewares(
            fynApp,
            fynModule,
            this,
            autoApplyMiddlewares,
            () => this.moduleLoader.createFynModuleRuntime(fynApp),
            async (cc, share) => this.signalMiddlewareReady(cc, { share })
        );
    }

    // Helper to access runtime data
    public getRunTime() {
        return this.runTime;
    }
}

// Helper to create mock FynApp with exposes
const createMockFynAppWithExposes = (name: string, exposes: Record<string, any> = {}) => ({
    name,
    version: '1.0.0',
    packageName: name,
    entry: {} as FynAppEntry,
    exposes,
    middlewareContext: new Map(),
});

// Helper to create middleware with autoApplyScope
const createUniversalMiddleware = (
    name: string,
    autoApplyScope?: ("all" | "fynapp" | "middleware")[],
    shouldApply?: (fynApp: FynApp) => boolean
): FynAppMiddlewareReg => {
    const middleware: FynAppMiddleware = {
        name,
        autoApplyScope,
        shouldApply,
        setup: vi.fn().mockResolvedValue({ status: "ready" }),
        apply: vi.fn(),
    };

    return {
        regKey: `provider::${name}`,
        fullKey: `provider@1.0.0::${name}`,
        hostFynApp: createMockFynAppWithExposes(`provider-${name}`),
        exposeName: `./middleware/${name}`,
        exportName: `__middleware__${name}`,
        middleware,
    };
};

describe('Universal Middleware Support', () => {
    let kernel: UniversalMiddlewareTestKernel;

    beforeEach(() => {
        kernel = new UniversalMiddlewareTestKernel();
    });

    describe('Middleware Registration with autoApplyScope', () => {
        it('should register middleware without autoApplyScope as explicit-use only', () => {
            const middleware = createUniversalMiddleware('database');

            kernel.registerMiddleware(middleware);

            const runtime = kernel.getRunTime();
            expect(runtime.middlewares['provider::database']).toBeDefined();
            expect(runtime.autoApplyMiddlewares).toBeUndefined();
        });

        it('should register middleware with autoApplyScope: ["fynapp"]', () => {
            const middleware = createUniversalMiddleware('layout-manager', ['fynapp']);

            kernel.registerMiddleware(middleware);

            const runtime = kernel.getRunTime();
            expect(runtime.autoApplyMiddlewares?.fynapp).toContain(middleware);
            expect(runtime.autoApplyMiddlewares?.middleware).not.toContain(middleware);
        });

        it('should register middleware with autoApplyScope: ["middleware"]', () => {
            const middleware = createUniversalMiddleware('dev-tools', ['middleware']);

            kernel.registerMiddleware(middleware);

            const runtime = kernel.getRunTime();
            expect(runtime.autoApplyMiddlewares?.middleware).toContain(middleware);
            expect(runtime.autoApplyMiddlewares?.fynapp).not.toContain(middleware);
        });

        it('should register middleware with autoApplyScope: ["all"]', () => {
            const middleware = createUniversalMiddleware('logger', ['all']);

            kernel.registerMiddleware(middleware);

            const runtime = kernel.getRunTime();
            expect(runtime.autoApplyMiddlewares?.fynapp).toContain(middleware);
            expect(runtime.autoApplyMiddlewares?.middleware).toContain(middleware);
        });

        it('should register middleware with autoApplyScope: ["fynapp", "middleware"]', () => {
            const middleware = createUniversalMiddleware('analytics', ['fynapp', 'middleware']);

            kernel.registerMiddleware(middleware);

            const runtime = kernel.getRunTime();
            expect(runtime.autoApplyMiddlewares?.fynapp).toContain(middleware);
            expect(runtime.autoApplyMiddlewares?.middleware).toContain(middleware);
        });

        it('should handle empty autoApplyScope array', () => {
            const middleware = createUniversalMiddleware('empty-scope', []);

            kernel.registerMiddleware(middleware);

            const runtime = kernel.getRunTime();
            expect(runtime.autoApplyMiddlewares).toBeUndefined();
        });
    });

    describe('FynApp Type Detection', () => {
        it('should detect regular FynApp (no middleware exposes)', async () => {
            const layoutMiddleware = createUniversalMiddleware('layout-manager', ['fynapp']);
            kernel.registerMiddleware(layoutMiddleware);

            const regularFynApp = createMockFynAppWithExposes('regular-app', {
                './main': { main: {} },
                './component': { Component: {} }
            });

            await kernel.testApplyAutoScopeMiddlewares(regularFynApp);

            expect(layoutMiddleware.middleware.setup).toHaveBeenCalledWith(
                expect.objectContaining({
                    fynApp: regularFynApp,
                })
            );
        });

        it('should detect middleware provider FynApp', async () => {
            const devToolsMiddleware = createUniversalMiddleware('dev-tools', ['middleware']);
            kernel.registerMiddleware(devToolsMiddleware);

            const middlewareProviderFynApp = createMockFynAppWithExposes('middleware-provider', {
                './middleware/auth': { __middleware__Auth: {} },
                './main': { main: {} }
            });

            await kernel.testApplyAutoScopeMiddlewares(middlewareProviderFynApp);

            expect(devToolsMiddleware.middleware.setup).toHaveBeenCalledWith(
                expect.objectContaining({
                    fynApp: middlewareProviderFynApp,
                })
            );
        });

        it('should not apply fynapp-scoped middleware to middleware providers', async () => {
            const layoutMiddleware = createUniversalMiddleware('layout-manager', ['fynapp']);
            kernel.registerMiddleware(layoutMiddleware);

            const middlewareProviderFynApp = createMockFynAppWithExposes('middleware-provider', {
                './middleware/auth': { __middleware__Auth: {} }
            });

            await kernel.testApplyAutoScopeMiddlewares(middlewareProviderFynApp);

            expect(layoutMiddleware.middleware.setup).not.toHaveBeenCalled();
        });

        it('should not apply middleware-scoped middleware to regular FynApps', async () => {
            const devToolsMiddleware = createUniversalMiddleware('dev-tools', ['middleware']);
            kernel.registerMiddleware(devToolsMiddleware);

            const regularFynApp = createMockFynAppWithExposes('regular-app', {
                './main': { main: {} }
            });

            await kernel.testApplyAutoScopeMiddlewares(regularFynApp);

            expect(devToolsMiddleware.middleware.setup).not.toHaveBeenCalled();
        });
    });

    describe('shouldApply Filter Function', () => {
        it('should apply middleware when shouldApply returns true', async () => {
            const shouldApplyFn = vi.fn().mockReturnValue(true);
            const filteredMiddleware = createUniversalMiddleware('filtered', ['fynapp'], shouldApplyFn);
            kernel.registerMiddleware(filteredMiddleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            await kernel.testApplyAutoScopeMiddlewares(fynApp);

            expect(shouldApplyFn).toHaveBeenCalledWith(fynApp);
            expect(filteredMiddleware.middleware.setup).toHaveBeenCalled();
        });

        it('should skip middleware when shouldApply returns false', async () => {
            const shouldApplyFn = vi.fn().mockReturnValue(false);
            const filteredMiddleware = createUniversalMiddleware('filtered', ['fynapp'], shouldApplyFn);
            kernel.registerMiddleware(filteredMiddleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            await kernel.testApplyAutoScopeMiddlewares(fynApp);

            expect(shouldApplyFn).toHaveBeenCalledWith(fynApp);
            expect(filteredMiddleware.middleware.setup).not.toHaveBeenCalled();
        });

        it('should handle shouldApply function errors gracefully', async () => {
            const shouldApplyFn = vi.fn().mockImplementation(() => {
                throw new Error('Filter error');
            });
            const filteredMiddleware = createUniversalMiddleware('filtered', ['fynapp'], shouldApplyFn);
            kernel.registerMiddleware(filteredMiddleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            // Should not throw
            await expect(kernel.testApplyAutoScopeMiddlewares(fynApp)).resolves.not.toThrow();

            expect(shouldApplyFn).toHaveBeenCalledWith(fynApp);
            expect(filteredMiddleware.middleware.setup).not.toHaveBeenCalled();
        });

        it('should apply middleware without shouldApply function', async () => {
            const middleware = createUniversalMiddleware('no-filter', ['fynapp']);
            kernel.registerMiddleware(middleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            await kernel.testApplyAutoScopeMiddlewares(fynApp);

            expect(middleware.middleware.setup).toHaveBeenCalled();
        });
    });

    describe('Middleware Application Lifecycle', () => {
        it('should call setup and apply methods in correct order', async () => {
            const middleware = createUniversalMiddleware('lifecycle-test', ['fynapp']);
            kernel.registerMiddleware(middleware);

            const fynApp = createMockFynAppWithExposes('test-app');
            const fynModule = { execute: vi.fn() };

            await kernel.testApplyAutoScopeMiddlewares(fynApp, fynModule);

            expect(middleware.middleware.setup).toHaveBeenCalledBefore(middleware.middleware.apply as any);
            expect(middleware.middleware.apply).toHaveBeenCalledWith(
                expect.objectContaining({
                    fynApp,
                    fynMod: fynModule,
                    reg: middleware,
                })
            );
        });

        it('should create synthetic FynModule when none provided', async () => {
            const middleware = createUniversalMiddleware('synthetic-test', ['fynapp']);
            kernel.registerMiddleware(middleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            await kernel.testApplyAutoScopeMiddlewares(fynApp);

            expect(middleware.middleware.setup).toHaveBeenCalledWith(
                expect.objectContaining({
                    fynMod: expect.objectContaining({
                        execute: expect.any(Function),
                    }),
                })
            );
        });

        it('should handle setup method errors gracefully', async () => {
            const middleware = createUniversalMiddleware('error-setup', ['fynapp']);
            (middleware.middleware.setup as any).mockRejectedValue(new Error('Setup failed'));
            kernel.registerMiddleware(middleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            // Should not throw
            await expect(kernel.testApplyAutoScopeMiddlewares(fynApp)).resolves.not.toThrow();

            // Apply should not be called if setup fails
            expect(middleware.middleware.apply).not.toHaveBeenCalled();
        });

        it('should handle apply method errors gracefully', async () => {
            const middleware = createUniversalMiddleware('error-apply', ['fynapp']);
            (middleware.middleware.apply as any).mockImplementation(() => {
                throw new Error('Apply failed');
            });
            kernel.registerMiddleware(middleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            // Should not throw
            await expect(kernel.testApplyAutoScopeMiddlewares(fynApp)).resolves.not.toThrow();
        });
    });

    describe('Multiple Middleware Scenarios', () => {
        it('should apply multiple middleware to the same FynApp', async () => {
            const layout = createUniversalMiddleware('layout', ['fynapp']);
            const analytics = createUniversalMiddleware('analytics', ['fynapp']);
            const logger = createUniversalMiddleware('logger', ['all']);

            kernel.registerMiddleware(layout);
            kernel.registerMiddleware(analytics);
            kernel.registerMiddleware(logger);

            const regularFynApp = createMockFynAppWithExposes('test-app');

            await kernel.testApplyAutoScopeMiddlewares(regularFynApp);

            expect(layout.middleware.setup).toHaveBeenCalled();
            expect(analytics.middleware.setup).toHaveBeenCalled();
            expect(logger.middleware.setup).toHaveBeenCalled();
        });

        it('should apply different middleware to different FynApp types', async () => {
            const layout = createUniversalMiddleware('layout', ['fynapp']);
            const devTools = createUniversalMiddleware('dev-tools', ['middleware']);
            const logger = createUniversalMiddleware('logger', ['all']);

            kernel.registerMiddleware(layout);
            kernel.registerMiddleware(devTools);
            kernel.registerMiddleware(logger);

            const regularFynApp = createMockFynAppWithExposes('regular-app');
            const middlewareFynApp = createMockFynAppWithExposes('middleware-app', {
                './middleware/auth': { __middleware__Auth: {} }
            });

            await kernel.testApplyAutoScopeMiddlewares(regularFynApp);
            await kernel.testApplyAutoScopeMiddlewares(middlewareFynApp);

            // Regular FynApp should get layout + logger
            expect(layout.middleware.setup).toHaveBeenCalledWith(
                expect.objectContaining({ fynApp: regularFynApp })
            );
            expect(logger.middleware.setup).toHaveBeenCalledWith(
                expect.objectContaining({ fynApp: regularFynApp })
            );

            // Middleware FynApp should get dev-tools + logger
            expect(devTools.middleware.setup).toHaveBeenCalledWith(
                expect.objectContaining({ fynApp: middlewareFynApp })
            );
            expect(logger.middleware.setup).toHaveBeenCalledWith(
                expect.objectContaining({ fynApp: middlewareFynApp })
            );

            // Regular FynApp should NOT get dev-tools
            expect(devTools.middleware.setup).not.toHaveBeenCalledWith(
                expect.objectContaining({ fynApp: regularFynApp })
            );
        });
    });

    describe('Backward Compatibility', () => {
        it('should not affect middleware without autoApplyScope', () => {
            const traditionalMiddleware = createUniversalMiddleware('traditional');
            kernel.registerMiddleware(traditionalMiddleware);

            const runtime = kernel.getRunTime();
            expect(runtime.middlewares['provider::traditional']).toBeDefined();
            expect(runtime.autoApplyMiddlewares).toBeUndefined();
        });

        it('should continue to support explicit useMiddleware calls', () => {
            // This test verifies that the registration doesn't break existing functionality
            const middleware = createUniversalMiddleware('explicit-use', ['fynapp']);
            kernel.registerMiddleware(middleware);

            // Verify middleware is still available for lookup
            const result = kernel.getMiddleware('explicit-use', 'provider');
            expect(result.regKey).toBe('provider::explicit-use');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty runtime autoApplyMiddlewares gracefully', async () => {
            const fynApp = createMockFynAppWithExposes('test-app');

            // Should not throw when no auto-apply middleware registered
            await expect(kernel.testApplyAutoScopeMiddlewares(fynApp)).resolves.not.toThrow();
        });

        it('should handle FynApp with no exposes', async () => {
            const middleware = createUniversalMiddleware('test', ['fynapp']);
            kernel.registerMiddleware(middleware);

            const fynApp = createMockFynAppWithExposes('test-app', {});

            await kernel.testApplyAutoScopeMiddlewares(fynApp);

            expect(middleware.middleware.setup).toHaveBeenCalled();
        });

        it('should handle middleware without setup method', async () => {
            const middleware = createUniversalMiddleware('no-setup', ['fynapp']);
            middleware.middleware.setup = undefined;
            kernel.registerMiddleware(middleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            // Should not throw
            await expect(kernel.testApplyAutoScopeMiddlewares(fynApp)).resolves.not.toThrow();

            expect(middleware.middleware.apply).toHaveBeenCalled();
        });

        it('should handle middleware without apply method', async () => {
            const middleware = createUniversalMiddleware('no-apply', ['fynapp']);
            middleware.middleware.apply = undefined;
            kernel.registerMiddleware(middleware);

            const fynApp = createMockFynAppWithExposes('test-app');

            // Should not throw
            await expect(kernel.testApplyAutoScopeMiddlewares(fynApp)).resolves.not.toThrow();

            expect(middleware.middleware.setup).toHaveBeenCalled();
        });
    });
});
