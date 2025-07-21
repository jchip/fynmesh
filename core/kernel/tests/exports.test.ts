import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Export Files Coverage', () => {
    describe('index.ts exports', () => {
        it('should export all public interfaces', async () => {
            const indexModule = await import('../src/index.js');

            // Should export types and utilities
            expect(indexModule).toBeDefined();
            expect(indexModule.useMiddleware).toBeDefined();
            expect(indexModule.noOpMiddlewareUser).toBeDefined();
            expect(indexModule.fynMeshShareScope).toBeDefined();
        });
    });

    describe('browser.ts global setup', () => {
        let originalGlobalThis: any;

        beforeEach(() => {
            originalGlobalThis = globalThis;
            // Clear any existing fynMeshKernel
            delete (globalThis as any).fynMeshKernel;
        });

        afterEach(() => {
            // Restore original state
            if (originalGlobalThis.fynMeshKernel) {
                (globalThis as any).fynMeshKernel = originalGlobalThis.fynMeshKernel;
            } else {
                delete (globalThis as any).fynMeshKernel;
            }
        });

        it('should create global browser kernel instance', async () => {
            // Import the browser module to execute the global assignment
            await import('../src/browser.js');

            // Should have created global instance
            expect((globalThis as any).fynMeshKernel).toBeDefined();
            expect(typeof (globalThis as any).fynMeshKernel.loadFynApp).toBe('function');
            expect(typeof (globalThis as any).fynMeshKernel.registerMiddleware).toBe('function');
        });
    });

    describe('node.ts global export', () => {
        it('should export fynMeshKernel instance', async () => {
            const nodeModule = await import('../src/node.js');

            // Should export the kernel instance
            expect(nodeModule.fynMeshKernel).toBeDefined();
            expect(typeof nodeModule.fynMeshKernel.loadFynApp).toBe('function');
            expect(typeof nodeModule.fynMeshKernel.registerMiddleware).toBe('function');
        });

        it('should create different instance from browser kernel', async () => {
            const nodeModule = await import('../src/node.js');
            const browserModule = await import('../src/browser.js');

            // Should be different instances
            expect(nodeModule.fynMeshKernel).not.toBe((globalThis as any).fynMeshKernel);
        });
    });
});
