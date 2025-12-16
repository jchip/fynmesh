import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry, FynApp, FynModule } from '../src/types.js';

// Extended test kernel that exposes protected methods for testing
class AdvancedTestKernel extends FynMeshKernelCore {
    async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
        // Mock implementation for abstract method
    }

    // Expose protected methods for testing
    public async testLoadFynAppBasics(entry: FynAppEntry): Promise<FynApp> {
        return this.loadFynAppBasics(entry);
    }

    public async testBootstrapFynApp(fynApp: FynApp): Promise<void> {
        return this.bootstrapFynApp(fynApp);
    }
}

describe('KernelCore Advanced Functionality', () => {
    let kernel: AdvancedTestKernel;

    beforeEach(() => {
        kernel = new AdvancedTestKernel();
    });

    describe('loadFynAppBasics', () => {
        it('should load basic FynApp structure', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'test-app',
                    version: '1.2.0',
                    $E: {
                        './config': './config',
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockImplementation((name) => {
                    if (name === './config') {
                        return Promise.resolve(() => ({ theme: 'dark', debug: true }));
                    }
                    if (name === './main') {
                        return Promise.resolve(() => ({
                            main: { initialize: vi.fn(), execute: vi.fn() },
                            __middleware__TestMW: { name: 'test-middleware', setup: vi.fn() }
                        }));
                    }
                }),
                setup: vi.fn().mockResolvedValue(undefined),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            expect(mockEntry.init).toHaveBeenCalled();
            expect(mockEntry.setup).toHaveBeenCalled();
            expect(mockEntry.get).toHaveBeenCalledWith('./config');
            expect(mockEntry.get).toHaveBeenCalledWith('./main');

            expect(fynApp.name).toBe('test-app');
            expect(fynApp.version).toBe('1.2.0');
            expect(fynApp.packageName).toBe('test-app');
            expect(fynApp.config).toEqual({ theme: 'dark', debug: true });
            expect(fynApp.exposes['./main']).toBeDefined();
            expect(fynApp.middlewareContext).toBeInstanceOf(Map);
        });

        it('should handle missing config gracefully', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'minimal-app',
                    version: '1.0.0',
                    $E: {
                        './main': './main',
                    },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockResolvedValue(() => ({ main: vi.fn() })),
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            expect(fynApp.name).toBe('minimal-app');
            expect(fynApp.config).toBeUndefined();
            expect(mockEntry.get).not.toHaveBeenCalledWith('./config');
        });

        it('should handle missing setup method', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'no-setup-app',
                    version: '1.0.0',
                    $E: { './main': './main' },
                } as any,
                init: vi.fn(),
                get: vi.fn().mockResolvedValue(() => ({ main: vi.fn() })),
                // No setup method
            };

            const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

            expect(fynApp.name).toBe('no-setup-app');
            expect(mockEntry.init).toHaveBeenCalled();
        });
    });

    describe('middleware management integration', () => {
        it('should register middleware correctly', () => {
            const mockMiddleware = createMockMiddleware('integration-test');

            expect(() => kernel.registerMiddleware(mockMiddleware)).not.toThrow();

            // Check that middleware was registered in runtime
            const middlewares = kernel['runTime'].middlewares;
            expect(middlewares['integration-test']).toBeDefined();
            expect(middlewares['integration-test']['1.0.0']).toBe(mockMiddleware);
        });

        it('should handle duplicate middleware registration', () => {
            const mockMiddleware = createMockMiddleware('duplicate-test');

            // Register twice
            kernel.registerMiddleware(mockMiddleware);
            kernel.registerMiddleware(mockMiddleware);

            // Should not throw and should be stored
            const middlewares = kernel['runTime'].middlewares;
            expect(middlewares['duplicate-test']).toBeDefined();
            expect(middlewares['duplicate-test']['1.0.0']).toBe(mockMiddleware);
        });

        it('should handle provider-specific middleware lookup', () => {
            const mockMiddleware = createMockMiddleware('test-middleware');
            mockMiddleware.regKey = 'test-provider::test-middleware';

            kernel.registerMiddleware(mockMiddleware);

            const retrieved = kernel.getMiddleware('test-middleware', 'test-provider');
            expect(retrieved.regKey).toBe('test-provider::test-middleware');
        });

        it('should return dummy middleware for non-existent middleware', () => {
            const retrieved = kernel.getMiddleware('non-existent');
            expect(retrieved.regKey).toBe(''); // DummyMiddlewareReg has empty regKey
        });

        it('should use version-based middleware storage', () => {
            const mockMiddleware1 = createMockMiddleware('versioned-test');
            mockMiddleware1.hostFynApp.version = '1.0.0';

            const mockMiddleware2 = createMockMiddleware('versioned-test');
            mockMiddleware2.hostFynApp.version = '2.0.0';

            kernel.registerMiddleware(mockMiddleware1);
            kernel.registerMiddleware(mockMiddleware2);

            const middlewares = kernel['runTime'].middlewares;
            expect(middlewares['versioned-test']['1.0.0']).toBe(mockMiddleware1);
            expect(middlewares['versioned-test']['2.0.0']).toBe(mockMiddleware2);
            expect(middlewares['versioned-test']['default']).toBe(mockMiddleware1); // First registered becomes default
        });
    });

    describe('error handling and edge cases', () => {
        it('should throw for missing version in loadFynAppBasics', async () => {
            const mockEntry: FynAppEntry = {
                container: {
                    name: 'test-app',
                    // Missing version
                    $E: {},
                } as any,
                init: vi.fn(),
                get: vi.fn(),
            };

            // Version is required - should throw
            await expect(kernel.testLoadFynAppBasics(mockEntry))
                .rejects.toThrow('Invalid FynApp container');
        });

        it('should handle empty bootstrap gracefully', async () => {
            const mockFynApp: FynApp = {
                name: 'empty-app',
                version: '1.0.0',
                packageName: 'empty-app',
                entry: { container: { $E: {} } } as any,
                exposes: {}, // No main module
                middlewareContext: new Map(),
            };

            // Should not throw
            await expect(kernel.testBootstrapFynApp(mockFynApp)).resolves.not.toThrow();
        });
    });
});
