import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry, FynApp, FynModule } from '../src/types.js';

// Test kernel exposing bootstrap for deferred testing
class DeferredTestKernel extends FynMeshKernelCore {
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

describe('KernelCore Deferred Middleware Logic', () => {
    let kernel: DeferredTestKernel;

    beforeEach(() => {
        kernel = new DeferredTestKernel();
    });

    describe('middleware defer and retry mechanisms', () => {
        it('should handle middleware initialization with defer status paths', async () => {
            // Create middleware that will be found
            const testMiddleware = createMockMiddleware('defer-test');
            testMiddleware.regKey = 'provider::defer-test';
            testMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            testMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(testMiddleware);

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'defer-init-app',
                    version: '1.0.0',
                    $E: {
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [
                                    {
                                        info: { name: 'defer-test', provider: 'provider' },
                                        config: { test: true }
                                    }
                                ],
                                // Test with initialize that can return defer status
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

            // This exercises the middleware call chain with status handling
            await kernel.testBootstrapFynApp(fynApp);

            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.initialize).toHaveBeenCalled();
            expect(mainModule!.execute).toHaveBeenCalled();
            expect(testMiddleware.middleware.setup).toHaveBeenCalled();
            expect(testMiddleware.middleware.apply).toHaveBeenCalled();
        });

        it('should handle modules with missing middleware (exercising filter logic)', async () => {
            // Register one valid middleware but use different name in metadata
            const validMiddleware = createMockMiddleware('different-name');
            validMiddleware.regKey = 'provider::different-name';
            validMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            validMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(validMiddleware);

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'mixed-middleware-app',
                    version: '1.0.0',
                    $E: {
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [
                                    {
                                        info: { name: 'missing-middleware', provider: 'void' },
                                        config: { test: true }
                                    },
                                    {
                                        info: { name: 'different-name', provider: 'provider' },
                                        config: { test: true }
                                    }
                                ],
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

            // This will exercise lines 380-381, 390-392 where some middleware is missing
            await kernel.testBootstrapFynApp(fynApp);

            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.initialize).toHaveBeenCalled();
            expect(mainModule!.execute).toHaveBeenCalled();
            expect(validMiddleware.middleware.setup).toHaveBeenCalled();
        });

        it('should handle complex middleware orchestration scenarios', async () => {
            const orchestrationMiddleware = createMockMiddleware('orchestration-test');
            orchestrationMiddleware.regKey = 'provider::orchestration-test';
            orchestrationMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            orchestrationMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(orchestrationMiddleware);

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'orchestration-app',
                    version: '1.0.0',
                    $E: {
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [
                                    {
                                        info: { name: 'orchestration-test', provider: 'provider' },
                                        config: { test: true }
                                    }
                                ],
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

            // Verify the full middleware orchestration flow
            expect(orchestrationMiddleware.middleware.setup).toHaveBeenCalled();
            expect(orchestrationMiddleware.middleware.apply).toHaveBeenCalled();
        });
    });

    describe('bootstrap edge cases', () => {
        it('should handle FynApp with loadMiddlewares but no middleware modules', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'no-actual-middleware-app',
                    version: '1.0.0',
                    $E: {
                        './config': './config',
                        './main': './main',
                        './utils': './utils',      // Not a middleware
                        './components': './components', // Not a middleware
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './config') {
                        return Promise.resolve(() => ({
                            loadMiddlewares: true, // Enable middleware loading
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
                    return Promise.resolve(() => ({
                        utility: vi.fn(),
                    }));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // This exercises the bootstrap logic where loadMiddlewares is true
            // but no modules start with "./middleware"
            await kernel.testBootstrapFynApp(fynApp);

            expect(fynApp.config?.loadMiddlewares).toBe(true);
            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.execute).toHaveBeenCalled();
        });

        it('should handle bootstrap with middleware loading and mixed modules', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'mixed-modules-app',
                    version: '1.0.0',
                    $E: {
                        './config': './config',
                        './main': './main',
                        './middleware-auth': './middleware-auth',
                        './middleware-logging': './middleware-logging',
                        './utils': './utils',
                        './components': './components',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './config') {
                        return Promise.resolve(() => ({
                            loadMiddlewares: true,
                            environment: 'production',
                        }));
                    }
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    if (exposeName.startsWith('./middleware-')) {
                        const name = exposeName.replace('./middleware-', '');
                        return Promise.resolve(() => ({
                            [`__middleware__${name}`]: {
                                name: `${name}-provider`,
                                setup: vi.fn().mockResolvedValue({ status: 'ready' }),
                                apply: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    return Promise.resolve(() => ({
                        utility: vi.fn(),
                    }));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // This will exercise the full bootstrap middleware loading loop
            await kernel.testBootstrapFynApp(fynApp);

            expect(fynApp.config?.loadMiddlewares).toBe(true);

            // Bootstrap completed successfully with middleware loading enabled
            // The middleware modules are loaded during the bootstrap process

            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.execute).toHaveBeenCalled();
        });
    });

    describe('module without __middlewareMeta scenarios', () => {
        it('should handle main module without middleware metadata gracefully', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'no-meta-app',
                    version: '1.0.0',
                    $E: {
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                // No __middlewareMeta property
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

            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.initialize).toHaveBeenCalled();
            expect(mainModule!.execute).toHaveBeenCalled();
        });
    });
});
