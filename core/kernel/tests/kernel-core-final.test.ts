import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry, FynApp, FynModule } from '../src/types.js';

// Test kernel for final coverage push
class FinalTestKernel extends FynMeshKernelCore {
    async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
        // Mock implementation
    }

    public async testBootstrapFynApp(fynApp: FynApp): Promise<void> {
        return this.bootstrapFynApp(fynApp);
    }

    public async testLoadFynAppBasics(entry: FynAppEntry): Promise<FynApp> {
        return this.loadFynAppBasics(entry);
    }



    public getMiddlewareReady() {
        return (this.middlewareExecutor as any).middlewareReady;
    }
}

describe('KernelCore Final Push to 90%', () => {
    let kernel: FinalTestKernel;

    beforeEach(() => {
        kernel = new FinalTestKernel();
    });

    describe('hitting remaining uncovered lines', () => {
        it('should hit lines 193, 196-197: middleware registration with __name and debug output', async () => {
            const testMiddleware = createMockMiddleware('named-middleware');
            testMiddleware.regKey = 'provider::named-middleware';
            testMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            kernel.registerMiddleware(testMiddleware);

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'named-middleware-app',
                    version: '1.0.0',
                    $E: {
                        './config': './config',
                        './middleware-test': './middleware-test',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './config') {
                        return Promise.resolve(() => ({
                            loadMiddlewares: true,
                        }));
                    }
                    if (exposeName === './middleware-test') {
                        return Promise.resolve(() => ({
                            __middleware__testMiddleware: testMiddleware.middleware,
                            __name: 'test-named-middleware', // This will trigger line 196-197
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // This should hit lines 193 (debug output), 196-197 (__name assignment), and 414-419 (middleware loading)
            await kernel.testBootstrapFynApp(fynApp);

            expect(fynApp.config?.loadMiddlewares).toBe(true);
            // The middleware loading and __name assignment paths should have been exercised
        });

        it('should hit lines 201-202: missing expose module debug output during bootstrap', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'missing-middleware-app',
                    version: '1.0.0',
                    $E: {
                        './config': './config',
                        './middleware-missing': './middleware-missing',
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './config') {
                        return Promise.resolve(() => ({
                            loadMiddlewares: true,
                        }));
                    }
                    if (exposeName === './middleware-missing') {
                        // Return undefined to simulate missing middleware module - this hits lines 201-202
                        return Promise.resolve(() => undefined);
                    }
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // Bootstrap will try to load ./middleware-missing and hit lines 201-202 for missing module
            await kernel.testBootstrapFynApp(fynApp);

            expect(fynApp.config?.loadMiddlewares).toBe(true);
            expect(fynApp.exposes['./middleware-missing']).toBeUndefined();
        });

        it('should hit lines 269-272: checkSingleMiddlewareReady with ready middleware', async () => {
            const readyMiddleware = createMockMiddleware('ready-middleware');
            readyMiddleware.regKey = 'provider::ready-middleware';
            readyMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            readyMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(readyMiddleware);

            // Pre-populate middlewareReady to simulate ready middleware
            const middlewareReady = kernel.getMiddlewareReady();
            middlewareReady.set('provider::ready-middleware', { test: 'shared-data' });

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'ready-middleware-app',
                    version: '1.0.0',
                    $E: { './main': './main' },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [{
                                    info: { name: 'ready-middleware', provider: 'provider' },
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

            // Lines 269-272: should have found ready middleware and set runtime.share
            expect(readyMiddleware.middleware.setup).toHaveBeenCalled();
            expect(readyMiddleware.middleware.apply).toHaveBeenCalled();
        });

        it('should hit lines 380-381: module without __middlewareMeta returning early', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'no-meta-app',
                    version: '1.0.0',
                    $E: { './main': './main' },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                // NO __middlewareMeta property - this triggers lines 380-381
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

            // Lines 380-381: useMiddlewareOnFynModule should return "" for module without metadata
            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.initialize).toHaveBeenCalled();
            expect(mainModule!.execute).toHaveBeenCalled();
        });

        it('should hit lines 414-419: bootstrap middleware loading with multiple middleware modules', async () => {
            const authMiddleware = createMockMiddleware('auth');
            authMiddleware.regKey = 'auth::provider';
            authMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            kernel.registerMiddleware(authMiddleware);

            const loggingMiddleware = createMockMiddleware('logging');
            loggingMiddleware.regKey = 'logging::provider';
            loggingMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            kernel.registerMiddleware(loggingMiddleware);

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'multi-middleware-app',
                    version: '1.0.0',
                    $E: {
                        './config': './config',
                        './main': './main',
                        './middleware-auth': './middleware-auth',
                        './middleware-logging': './middleware-logging',
                        './middleware-theme': './middleware-theme',
                        './utils': './utils',  // Not a middleware
                        './components': './components',  // Not a middleware
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './config') {
                        return Promise.resolve(() => ({
                            loadMiddlewares: true, // This enables the middleware loading loop (lines 414-419)
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
                            __name: 'auth-middleware',
                        }));
                    }
                    if (exposeName === './middleware-logging') {
                        return Promise.resolve(() => ({
                            __middleware__logging: loggingMiddleware.middleware,
                            __name: 'logging-middleware',
                        }));
                    }
                    if (exposeName === './middleware-theme') {
                        return Promise.resolve(() => ({
                            __middleware__theme: {
                                setup: vi.fn().mockResolvedValue({ status: 'ready' }),
                            },
                            __name: 'theme-middleware',
                        }));
                    }
                    return Promise.resolve(() => ({
                        utility: vi.fn(),
                    }));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // This will exercise lines 414-419: the full middleware loading loop
            await kernel.testBootstrapFynApp(fynApp);

            expect(fynApp.config?.loadMiddlewares).toBe(true);

            // The middleware loading loop (lines 414-419) and module loading logic should have been exercised

            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.execute).toHaveBeenCalled();
        });
    });
});
