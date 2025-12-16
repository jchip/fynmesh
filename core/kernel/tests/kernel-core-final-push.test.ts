import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry, FynApp, FynModule } from '../src/types.js';

// Specialized kernel to hit exact uncovered lines
class FinalPushKernel extends FynMeshKernelCore {
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

describe('KernelCore Final Push to 90%+', () => {
    let kernel: FinalPushKernel;

    beforeEach(() => {
        kernel = new FinalPushKernel();
    });

    it('should hit lines 193, 196-197, 201-202, 269-272, 380-381, 414-419 all together', async () => {
        // Create middleware for ready check (lines 269-272)
        const readyMiddleware = createMockMiddleware('ready-test');
        readyMiddleware.regKey = 'provider::ready-test';
        readyMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
        readyMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
        kernel.registerMiddleware(readyMiddleware);

        // Pre-populate middleware as ready (lines 269-272)
        const middlewareReady = kernel.getMiddlewareReady();
        middlewareReady.set('provider::ready-test', { shared: 'data' });

        const mockEntry: FynAppEntry = {
            container: {
                name: 'comprehensive-test-app',
                version: '1.0.0',
                $E: {
                    './config': './config',
                    './main': './main',
                    './middleware-named': './middleware-named',
                    './middleware-missing': './middleware-missing',
                },
            } as any,
            init: vi.fn(),
            get: vi.fn().mockImplementation((exposeName) => {
                if (exposeName === './config') {
                    return Promise.resolve(() => ({
                        loadMiddlewares: true, // Enable middleware loading (lines 414-419)
                    }));
                }
                if (exposeName === './main') {
                    return Promise.resolve(() => ({
                        main: {
                            // NO __middlewareMeta - triggers lines 380-381
                            initialize: vi.fn().mockResolvedValue({ status: 'ready' }),
                            execute: vi.fn().mockResolvedValue(undefined),
                        }
                    }));
                }
                if (exposeName === './middleware-named') {
                    return Promise.resolve(() => ({
                        __middleware__namedTest: {
                            setup: vi.fn().mockResolvedValue({ status: 'ready' }),
                        },
                        __name: 'named-test-middleware', // This triggers lines 196-197
                    }));
                }
                if (exposeName === './middleware-missing') {
                    // Return undefined - triggers lines 201-202
                    return Promise.resolve(() => undefined);
                }
                return Promise.resolve(() => ({}));
            }),
            setup: vi.fn().mockResolvedValue(undefined),
        };

        const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

        // This single bootstrap should hit ALL the remaining uncovered lines:
        // - 414-419: middleware loading loop
        // - 193: debug output for middleware registration
        // - 196-197: __name assignment
        // - 201-202: missing module debug output
        // - 269-272: middleware ready check
        // - 380-381: early return for no middleware metadata
        await kernel.testBootstrapFynApp(fynApp);

        expect(fynApp.config?.loadMiddlewares).toBe(true);

        const mainModule = fynApp.exposes['./main']?.main;
        expect(mainModule).toBeDefined();
        expect(mainModule!.initialize).toHaveBeenCalled();
        expect(mainModule!.execute).toHaveBeenCalled();
    });

    it('should hit lines 269-272 with a middleware module that has ready middleware', async () => {
        // Create a middleware module that will use ready middleware
        const testMiddleware = createMockMiddleware('ready-check');
        testMiddleware.regKey = 'test::ready-check';
        testMiddleware.middleware.setup = vi.fn().mockResolvedValue({ status: 'ready' });
        testMiddleware.middleware.apply = vi.fn().mockResolvedValue(undefined);
        kernel.registerMiddleware(testMiddleware);

        // Pre-populate middlewareReady map
        const middlewareReady = kernel.getMiddlewareReady();
        middlewareReady.set('test::ready-check', { ready: true });

        const mockEntry: FynAppEntry = {
            container: {
                name: 'ready-check-app',
                version: '1.0.0',
                $E: { './main': './main' },
            } as any,
            init: vi.fn(),
            get: vi.fn().mockImplementation((exposeName) => {
                if (exposeName === './main') {
                    return Promise.resolve(() => ({
                        main: {
                            __middlewareMeta: [{
                                info: { name: 'ready-check', provider: 'test' },
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

        // This should exercise checkSingleMiddlewareReady and hit lines 269-272
        expect(testMiddleware.middleware.setup).toHaveBeenCalled();
        expect(testMiddleware.middleware.apply).toHaveBeenCalled();
    });
});
