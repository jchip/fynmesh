import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserKernel, createBrowserKernel } from '../src/browser-kernel.js';

// Mock global Federation object
const mockFederation = {
    import: vi.fn(),
};

describe('BrowserKernel', () => {
    let kernel: BrowserKernel;

    beforeEach(() => {
        kernel = new BrowserKernel();
        // Setup global Federation mock
        (globalThis as any).Federation = mockFederation;
        vi.clearAllMocks();
    });

    describe('initialization', () => {
        it('should create a browser kernel instance', () => {
            expect(kernel).toBeInstanceOf(BrowserKernel);
            expect(kernel.version).toBe('1.0.0');
            expect(kernel.shareScopeName).toBe('fynmesh');
        });

        it('should have empty runtime initially', () => {
            expect(kernel['runTime'].appsLoaded).toEqual({});
            expect(kernel['runTime'].middlewares).toEqual({});
        });
    });

    describe('loadFynApp', () => {
        it('should load fynapp through Federation.js', async () => {
            const mockEntry = {
                name: 'test-app',
                version: '1.0.0',
                container: {
                    name: 'test-app',
                    version: '1.0.0',
                    $E: {
                        './config': true,
                        './main': true,
                    },
                },
                init: vi.fn(),
                get: vi.fn().mockResolvedValue(() => ({ main: vi.fn() })),
            };

            mockFederation.import.mockResolvedValue(mockEntry);

            // Mock the kernel methods that would be called
            const loadFynAppBasicsSpy = vi.spyOn(kernel, 'loadFynAppBasics' as any).mockResolvedValue({
                name: 'test-app',
                version: '1.0.0',
                exposes: { './main': { main: vi.fn() } },
            });
            const bootstrapFynAppSpy = vi.spyOn(kernel, 'bootstrapFynApp' as any).mockResolvedValue(undefined);

            await kernel.loadFynApp('http://example.com/app');

            expect(mockFederation.import).toHaveBeenCalledWith('http://example.com/app/fynapp-entry.js');
            expect(loadFynAppBasicsSpy).toHaveBeenCalledWith(mockEntry);
            expect(bootstrapFynAppSpy).toHaveBeenCalled();
        });

        it('should use custom loadId when provided', async () => {
            const mockEntry = { name: 'test-app', version: '1.0.0' };
            mockFederation.import.mockResolvedValue(mockEntry);

            vi.spyOn(kernel, 'loadFynAppBasics' as any).mockResolvedValue({});
            vi.spyOn(kernel, 'bootstrapFynApp' as any).mockResolvedValue(undefined);

            await kernel.loadFynApp('http://example.com/app', 'custom-id');

            expect(mockFederation.import).toHaveBeenCalledWith('http://example.com/app/fynapp-entry.js');
        });

        it('should throw error when Federation.js is not loaded', async () => {
            (globalThis as any).Federation = undefined;

            await expect(kernel.loadFynApp('http://example.com/app'))
                .rejects.toThrow('Federation.js is not loaded.');
        });

        it('should handle Federation.js import errors', async () => {
            const importError = new Error('Federation import failed');
            mockFederation.import.mockRejectedValue(importError);

            await expect(kernel.loadFynApp('http://example.com/app'))
                .rejects.toThrow('Federation import failed');

            expect(mockFederation.import).toHaveBeenCalledWith('http://example.com/app/fynapp-entry.js');
        });

        it('should handle loadFynAppBasics errors', async () => {
            const mockEntry = { name: 'test-app', version: '1.0.0' };
            mockFederation.import.mockResolvedValue(mockEntry);

            const basicsError = new Error('Failed to load basics');
            vi.spyOn(kernel, 'loadFynAppBasics' as any).mockRejectedValue(basicsError);

            await expect(kernel.loadFynApp('http://example.com/app'))
                .rejects.toThrow('Failed to load basics');
        });

        it('should handle bootstrapFynApp errors', async () => {
            const mockEntry = { name: 'test-app', version: '1.0.0' };
            mockFederation.import.mockResolvedValue(mockEntry);

            vi.spyOn(kernel, 'loadFynAppBasics' as any).mockResolvedValue({});

            const bootstrapError = new Error('Failed to bootstrap');
            vi.spyOn(kernel, 'bootstrapFynApp' as any).mockRejectedValue(bootstrapError);

            await expect(kernel.loadFynApp('http://example.com/app'))
                .rejects.toThrow('Failed to bootstrap');
        });
    });
});

describe('createBrowserKernel', () => {
    it('should create and initialize a browser kernel', () => {
        const kernel = createBrowserKernel();

        expect(kernel).toBeInstanceOf(BrowserKernel);
        expect(kernel['runTime'].appsLoaded).toEqual({});
        expect(kernel['runTime'].middlewares).toEqual({});
    });

    it('should return different instances on multiple calls', () => {
        const kernel1 = createBrowserKernel();
        const kernel2 = createBrowserKernel();

        expect(kernel1).not.toBe(kernel2);
        expect(kernel1).toBeInstanceOf(BrowserKernel);
        expect(kernel2).toBeInstanceOf(BrowserKernel);
    });
});
