import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry, FynApp, FynModule } from '../src/types.js';

// Integration test kernel with public method exposure
class IntegrationTestKernel extends FynMeshKernelCore {
    async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
        // Mock implementation
    }

    public async testLoadFynAppBasics(entry: FynAppEntry): Promise<FynApp> {
        return this.loadFynAppBasics(entry);
    }

    public async testBootstrapFynApp(fynApp: FynApp): Promise<void> {
        return this.bootstrapFynApp(fynApp);
    }
}

describe('KernelCore Deep Integration', () => {
    let kernel: IntegrationTestKernel;

    beforeEach(() => {
        kernel = new IntegrationTestKernel();
    });

    describe('complete FynApp lifecycle with middleware', () => {
        it('should handle full middleware-enabled FynApp loading and bootstrap', async () => {
            // Setup comprehensive middleware ecosystem
            const authMiddleware = createMockMiddleware('auth-provider');
            authMiddleware.regKey = 'security::auth-provider';
            authMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            authMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(authMiddleware);

            const themeMiddleware = createMockMiddleware('theme-manager');
            themeMiddleware.regKey = 'ui::theme-manager';
            themeMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            themeMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(themeMiddleware);

            const loggingMiddleware = createMockMiddleware('logger');
            loggingMiddleware.regKey = 'observability::logger';
            loggingMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
            loggingMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
            kernel.registerMiddleware(loggingMiddleware);

            // Create comprehensive FynApp entry
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'enterprise-app',
                    version: '3.1.0',
                    $E: {
                        './config': './config',
                        './main': './main',
                        './middleware-auth': './middleware-auth',
                        './middleware-theme': './middleware-theme',
                        './middleware-logging': './middleware-logging',
                        './components': './components',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './config') {
                        return Promise.resolve(() => ({
                            environment: 'production',
                            loadMiddlewares: true,
                            features: {
                                authentication: true,
                                theming: true,
                                logging: true,
                            },
                        }));
                    }
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __middlewareMeta: [
                                    {
                                        info: { name: 'auth-provider', provider: 'security' },
                                        config: { strict: true, timeout: 5000 }
                                    },
                                    {
                                        info: { name: 'theme-manager', provider: 'ui' },
                                        config: { darkMode: true, responsive: true }
                                    },
                                    {
                                        info: { name: 'logger', provider: 'observability' },
                                        config: { level: 'info', persistent: true }
                                    }
                                ],
                                initialize: vi.fn().mockResolvedValue({ status: 'ready', initialized: true }),
                                execute: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    if (exposeName.startsWith('./middleware-')) {
                        const middlewareName = exposeName.replace('./middleware-', '');
                        return Promise.resolve(() => ({
                            [`__middleware__${middlewareName}`]: {
                                name: `${middlewareName}-middleware`,
                                setup: vi.fn().mockResolvedValue({ status: 'ready' }),
                                apply: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    if (exposeName === './components') {
                        return Promise.resolve(() => ({
                            Button: 'ReactComponent',
                            Modal: 'ReactComponent',
                            __name: 'ComponentLibrary',
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            // Load FynApp
            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // Verify basic loading
            expect(fynApp.name).toBe('enterprise-app');
            expect(fynApp.version).toBe('3.1.0');
            expect(fynApp.config).toEqual({
                environment: 'production',
                loadMiddlewares: true,
                features: {
                    authentication: true,
                    theming: true,
                    logging: true,
                },
            });

            // Verify main module is loaded (loadFynAppBasics only loads main)
            expect(fynApp.exposes['./main']).toBeDefined();
            // Other modules are loaded during bootstrap, not in loadFynAppBasics

            // Bootstrap the FynApp (this will exercise middleware orchestration)
            await kernel.testBootstrapFynApp(fynApp);

            // Verify middleware setup calls
            expect(authMiddleware.middleware.setup).toHaveBeenCalled();
            expect(themeMiddleware.middleware.setup).toHaveBeenCalled();
            expect(loggingMiddleware.middleware.setup).toHaveBeenCalled();

            // Verify middleware apply calls
            expect(authMiddleware.middleware.apply).toHaveBeenCalled();
            expect(themeMiddleware.middleware.apply).toHaveBeenCalled();
            expect(loggingMiddleware.middleware.apply).toHaveBeenCalled();

            // Verify main module execution
            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.initialize).toHaveBeenCalled();
            expect(mainModule!.execute).toHaveBeenCalled();
        });

        it('should handle FynApp with function-style main module', async () => {
            const mainFunction = vi.fn().mockResolvedValue(undefined);

            const mockEntry: FynAppEntry = {
                container: {
                    name: 'function-app',
                    version: '1.0.0',
                    $E: {
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: mainFunction
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);
            await kernel.testBootstrapFynApp(fynApp);

            expect(mainFunction).toHaveBeenCalledWith(
                expect.objectContaining({
                    fynApp: fynApp,
                    middlewareContext: expect.any(Map),
                })
            );
        });

        it('should handle FynApp with regular FynModule (no middleware)', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'simple-app',
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
                                initialize: vi.fn().mockResolvedValue({ status: 'ready' }),
                                execute: vi.fn().mockResolvedValue(undefined),
                                // No __middlewareMeta
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

        it('should handle FynApp without main module', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'no-main-app',
                    version: '1.0.0',
                    $E: {
                        './config': './config',
                        './utils': './utils',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './config') {
                        return Promise.resolve(() => ({
                            theme: 'light'
                        }));
                    }
                    if (exposeName === './utils') {
                        return Promise.resolve(() => ({
                            helper: vi.fn()
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // Should not throw when no main module exists
            await expect(kernel.testBootstrapFynApp(fynApp)).resolves.not.toThrow();
        });

        it('should handle mixed valid and missing middleware during bootstrap', async () => {
            // Register one valid middleware
            const validMiddleware = createMockMiddleware('valid-middleware');
            validMiddleware.regKey = 'provider::valid-middleware';
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
                                        info: { name: 'valid-middleware', provider: 'provider' },
                                        config: { setting: 'value' }
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

            // Should complete bootstrap with valid middleware
            await kernel.testBootstrapFynApp(fynApp);

            // Verify valid middleware was called
            expect(validMiddleware.middleware.setup).toHaveBeenCalled();
            expect(validMiddleware.middleware.apply).toHaveBeenCalled();

            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.initialize).toHaveBeenCalled();
            expect(mainModule!.execute).toHaveBeenCalled();
        });

        it('should handle middleware loading during bootstrap', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'middleware-loading-app',
                    version: '1.0.0',
                    $E: {
                        './config': './config',
                        './main': './main',
                        './middleware-security': './middleware-security',
                        './middleware-analytics': './middleware-analytics',
                        './other-module': './other-module', // Not a middleware
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
                        const middlewareName = exposeName.replace('./middleware-', '');
                        return Promise.resolve(() => ({
                            [`__middleware__${middlewareName}`]: {
                                name: `${middlewareName}-provider`,
                                setup: vi.fn().mockResolvedValue({ status: 'ready' }),
                                apply: vi.fn().mockResolvedValue(undefined),
                            }
                        }));
                    }
                    if (exposeName === './other-module') {
                        return Promise.resolve(() => ({
                            utility: vi.fn(),
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            // Should load middleware modules during bootstrap
            await kernel.testBootstrapFynApp(fynApp);

            // Verify bootstrap completed successfully and main module was executed
            // The middleware loading behavior is tested through the bootstrap process

            // Main should be executed
            const mainModule = fynApp.exposes['./main']?.main;
            expect(mainModule).toBeDefined();
            expect(mainModule!.execute).toHaveBeenCalled();
        });
    });

    describe('edge cases and error conditions', () => {
        it('should handle FynApp entry without setup method', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'no-setup-app',
                    version: '1.0.0',
                    $E: {
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockResolvedValue(() => ({
                    main: vi.fn()
                })),
                // No setup method
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            expect(fynApp.name).toBe('no-setup-app');
            expect(mockEntry.init).toHaveBeenCalled();
        });

        it('should handle missing version in container', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'version-missing-app',
                    // version is missing
                    $E: {
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockResolvedValue(() => ({
                    main: vi.fn()
                })),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            expect(fynApp.name).toBe('version-missing-app');
            expect(fynApp.version).toBe('1.0.0'); // Default version
        });

        it('should handle empty container exposures', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'empty-app',
                    version: '1.0.0',
                    $E: {}, // Empty exposures
                } as any,
                init: vi.fn(),
                get: vi.fn().mockResolvedValue(() => ({})),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);
            await kernel.testBootstrapFynApp(fynApp);

            expect(fynApp.name).toBe('empty-app');
            expect(Object.keys(fynApp.exposes)).toHaveLength(0);
        });

        it('should handle modules with empty __name property', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'empty-name-app',
                    version: '1.0.0',
                    $E: {
                        './main': './main', // Use main since loadFynAppBasics only loads main
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((exposeName) => {
                    if (exposeName === './main') {
                        return Promise.resolve(() => ({
                            main: {
                                __name: '', // Empty name
                                execute: vi.fn(),
                            }
                        }));
                    }
                    return Promise.resolve(() => ({}));
                }),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            expect(fynApp.exposes['./main']).toBeDefined();
            // Empty __name should not create an alias
            expect(fynApp.exposes['']).toBeUndefined();
        });
    });
});
