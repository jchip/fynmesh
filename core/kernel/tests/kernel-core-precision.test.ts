import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry, FynApp, FynModule } from '../src/types.js';

// Test kernel exposing private methods for precision testing
class PrecisionTestKernel extends FynMeshKernelCore {
    async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
        // Mock implementation
    }

    public async testBootstrapFynApp(fynApp: FynApp): Promise<void> {
        return this.bootstrapFynApp(fynApp);
    }

    public async testLoadFynAppBasics(entry: FynAppEntry): Promise<FynApp> {
        return this.loadFynAppBasics(entry);
    }


}

describe('KernelCore Precision Coverage for 90%', () => {
    let kernel: PrecisionTestKernel;

    beforeEach(() => {
        kernel = new PrecisionTestKernel();
    });

    describe('targeting uncovered lines for 90% coverage', () => {
        it('should hit line 320: middleware setup returning defer status', async () => {
            // Create middleware that returns defer on setup
            const deferMiddleware = createMockMiddleware('defer-setup');
            deferMiddleware.regKey = 'provider::defer-setup';
            deferMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'defer' });
            deferMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(deferMiddleware);

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'defer-setup-app',
                    version: '1.0.0',
                    $E: { './main': './main' },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [{
                                    info: { name: 'defer-setup', provider: 'provider' },
                                    config: {}
                                }],
                                initialize: vi.fn().mockResolvedValue({ status: 'ready' }),
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);
            await kernel.testBootstrapFynApp(fynApp);

            // Line 320: middleware setup returned defer status
            expect(deferMiddleware.middleware.setup).toHaveBeenCalled();
        });

        it('should hit lines 332-333: middleware callMiddlewares with retry', async () => {
            // Setup a scenario that leads to retry by mocking checkMiddlewareReady to return ready after defer
            const retryMiddleware = createMockMiddleware('retry-test');
            retryMiddleware.regKey = 'provider::retry-test';
            retryMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'defer' });
            retryMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(retryMiddleware);

            // Mock the checkMiddlewareReady to return "ready" so defer becomes retry
            const originalCheck = (kernel.middlewareExecutor as any).checkMiddlewareReady;
            (kernel.middlewareExecutor as any).checkMiddlewareReady = vi.fn().mockReturnValue('ready');

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'retry-app',
                    version: '1.0.0',
                    $E: { './main': './main' },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [{
                                    info: { name: 'retry-test', provider: 'provider' },
                                    config: {}
                                }],
                                initialize: vi.fn().mockResolvedValue({ status: 'ready' }),
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            try {
                const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

                // Lines 332-333: should trigger retry logic which eventually fails after 2 tries
                await expect(kernel.testBootstrapFynApp(fynApp)).rejects.toThrow('Middleware setup failed after 2 tries');
                expect(retryMiddleware.middleware.setup).toHaveBeenCalled();
            } finally {
                // Restore original method
                (kernel.middlewareExecutor as any).checkMiddlewareReady = originalCheck;
            }
        });

        it('should hit lines 344-345: initialize method returning defer status', async () => {
            // Create middleware for the module
            const testMiddleware = createMockMiddleware('init-defer');
            testMiddleware.regKey = 'provider::init-defer';
            testMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            testMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(testMiddleware);

            let initCallCount = 0;
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'init-defer-app',
                    version: '1.0.0',
                    $E: { './main': './main' },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [{
                                    info: { name: 'init-defer', provider: 'provider' },
                                    config: {}
                                }],
                                initialize: vi.fn().mockImplementation(() => {
                                    initCallCount++;
                                    // Return defer first time, then ready on retry
                                    return Promise.resolve({ status: initCallCount === 1 ? 'defer' : 'ready' });
                                }),
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);
            await kernel.testBootstrapFynApp(fynApp);

            // Lines 344-345: initialize returned defer status first, then ready on retry
            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule!.initialize).toHaveBeenCalledTimes(2);
            expect(mainModule!.execute).toHaveBeenCalled();
        });

        it('should hit lines 348-349: initialize with retry through checkDeferCalls', async () => {
            // Create middleware for the module
            const testMiddleware = createMockMiddleware('init-retry');
            testMiddleware.regKey = 'provider::init-retry';
            testMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            testMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(testMiddleware);

            // Mock checkMiddlewareReady to return ready so defer becomes retry
            const originalCheck = (kernel.middlewareExecutor as any).checkMiddlewareReady;
            (kernel.middlewareExecutor as any).checkMiddlewareReady = vi.fn().mockReturnValue('ready');

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'init-retry-app',
                    version: '1.0.0',
                    $E: { './main': './main' },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [{
                                    info: { name: 'init-retry', provider: 'provider' },
                                    config: {}
                                }],
                                initialize: vi.fn().mockResolvedValue({ status: 'defer' }),
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            try {
                const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

                // Lines 348-349: should trigger retry logic from defer which eventually fails after 2 tries
                await expect(kernel.testBootstrapFynApp(fynApp)).rejects.toThrow('Middleware setup failed after 2 tries');

                const mainModule = fynApp.exposes['./main']?.main;
                expect(mainModule!.initialize).toHaveBeenCalled();
            } finally {
                // Restore original method
                (kernel.middlewareExecutor as any).checkMiddlewareReady = originalCheck;
            }
        });

        it('should hit lines 380-381: module without __middlewareMeta early return', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'no-middleware-meta-app',
                    version: '1.0.0',
                    $E: { './main': './main' },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                // NO __middlewareMeta property
                                initialize: vi.fn().mockResolvedValue({ status: 'ready' }),
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);
            await kernel.testBootstrapFynApp(fynApp);

            // Lines 380-381: should handle module without middleware metadata
            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.initialize).toHaveBeenCalled();
            expect(mainModule!.execute).toHaveBeenCalled();
        });

        it('should hit lines 414-419: bootstrap with loadMiddlewares and actual middleware modules', async () => {
            const authMiddleware = createMockMiddleware('auth');
            authMiddleware.regKey = 'test::auth';
            authMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            kernel.registerMiddleware(authMiddleware);

            const themeMiddleware = createMockMiddleware('theme');
            themeMiddleware.regKey = 'test::theme';
            themeMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            kernel.registerMiddleware(themeMiddleware);

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'middleware-loading-app',
                    version: '1.0.0',
                    $E: {
                        './config': './config',
                        './main': './main',
                        './middleware-auth': './middleware-auth',
                        './middleware-theme': './middleware-theme',
                        './utils': './utils',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './config') {
                        return Promise.resolve(() => ({
                            loadMiddlewares: true, // This enables the middleware loading loop
                            environment: 'test',
                        }));
                    }
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    if (exposeName === './middleware-auth') {
                        return Promise.resolve(() => ({
                            __middleware__auth: authMiddleware.middleware,
                        }));
                    }
                    if (exposeName === './middleware-theme') {
                        return Promise.resolve(() => ({
                            __middleware__theme: themeMiddleware.middleware,
                        }));
                    }
                    return Promise.resolve(() => ({
                        utility: vi.fn(),
                    }));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // This will exercise lines 414-419: the middleware loading loop
            await kernel.testBootstrapFynApp(fynApp);

            expect(fynApp.config?.loadMiddlewares).toBe(true);

            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.execute).toHaveBeenCalled();
        });
    });
});
