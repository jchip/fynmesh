import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry, FynApp, FynModule } from '../src/types.js';

// Test kernel that focuses on public interface testing
class MiddlewareTestKernel extends FynMeshKernelCore {
    async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
        // Mock implementation for abstract method
    }

    public testBuildFynAppUrl(baseUrl: string, entryFile?: string): string {
        return this.buildFynAppUrl(baseUrl, entryFile);
    }
}

describe('KernelCore Advanced Functionality', () => {
    let kernel: MiddlewareTestKernel;

    beforeEach(() => {
        kernel = new MiddlewareTestKernel();
    });

    describe('URL building utilities', () => {
        it('should build FynApp URLs correctly with default entry file', () => {
            expect(kernel.testBuildFynAppUrl('https://example.com/app')).toBe(
                'https://example.com/app/fynapp-entry.js'
            );
        });

        it('should build FynApp URLs with custom entry file', () => {
            expect(kernel.testBuildFynAppUrl('https://example.com/app', 'custom-entry.js')).toBe(
                'https://example.com/app/custom-entry.js'
            );
        });

        it('should handle URLs with trailing slashes', () => {
            expect(kernel.testBuildFynAppUrl('https://example.com/app/')).toBe(
                'https://example.com/app/fynapp-entry.js'
            );
        });

        it('should handle complex URL paths', () => {
            expect(kernel.testBuildFynAppUrl('https://cdn.example.com/v2/apps/my-app')).toBe(
                'https://cdn.example.com/v2/apps/my-app/fynapp-entry.js'
            );
        });
    });

    describe('advanced middleware management', () => {
        it('should handle multiple middleware versions correctly', () => {
            // Register different versions of the same middleware
            const middleware1 = createMockMiddleware('auth-service');
            middleware1.hostFynApp.version = '1.0.0';

            const middleware2 = createMockMiddleware('auth-service');
            middleware2.hostFynApp.version = '2.0.0';

            const middleware3 = createMockMiddleware('auth-service');
            middleware3.hostFynApp.version = '1.5.0';

            kernel.registerMiddleware(middleware1);
            kernel.registerMiddleware(middleware2);
            kernel.registerMiddleware(middleware3);

            // Access internal storage to verify versioning
            const middlewares = kernel['runTime'].middlewares;
            expect(middlewares['auth-service']['1.0.0']).toBe(middleware1);
            expect(middlewares['auth-service']['2.0.0']).toBe(middleware2);
            expect(middlewares['auth-service']['1.5.0']).toBe(middleware3);
            expect(middlewares['auth-service']['default']).toBe(middleware1); // First registered becomes default
        });

        it('should handle provider-scoped middleware registration', () => {
            const uiMiddleware = createMockMiddleware('theme-provider');
            uiMiddleware.regKey = 'ui::theme-provider';

            const businessMiddleware = createMockMiddleware('theme-provider');
            businessMiddleware.regKey = 'business::theme-provider';

            kernel.registerMiddleware(uiMiddleware);
            kernel.registerMiddleware(businessMiddleware);

            // Test provider-specific lookup
            const uiResult = kernel.getMiddleware('theme-provider', 'ui');
            const businessResult = kernel.getMiddleware('theme-provider', 'business');

            expect(uiResult.regKey).toBe('ui::theme-provider');
            expect(businessResult.regKey).toBe('business::theme-provider');
        });

        it('should return dummy middleware for non-existent providers', () => {
            const result = kernel.getMiddleware('non-existent', 'unknown-provider');
            expect(result.regKey).toBe(''); // DummyMiddlewareReg
        });

        it('should handle middleware registration with complex names', () => {
            const complexMiddleware = createMockMiddleware('complex-name');
            complexMiddleware.regKey = 'org.example.ui::react-context-provider-v2';

            kernel.registerMiddleware(complexMiddleware);

            const middlewares = kernel['runTime'].middlewares;
            expect(middlewares['org.example.ui::react-context-provider-v2']).toBeDefined();
        });
    });

    describe('cleanContainerName utility', () => {
        it('should clean container names correctly', () => {
            // Test the actual behavior (replaces / with _)
            expect(kernel.cleanContainerName('webpack/container/reference/app')).toBe('webpack_container_reference_app');
            expect(kernel.cleanContainerName('org_example_app')).toBe('org_example_app');
            expect(kernel.cleanContainerName('simple')).toBe('simple');
            expect(kernel.cleanContainerName('')).toBe('');
        });
    });

    describe('runtime state verification', () => {
        it('should have proper runtime state initialized', () => {
            // Test that kernel starts with proper runtime state
            expect(kernel['runTime']).toBeDefined();
            expect(kernel['runTime'].middlewares).toBeDefined();
            expect(typeof kernel['runTime'].middlewares).toBe('object');
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle empty middleware registration gracefully', () => {
            const emptyMiddleware = createMockMiddleware('');
            emptyMiddleware.regKey = '';

            expect(() => kernel.registerMiddleware(emptyMiddleware)).not.toThrow();
        });

        it('should handle middleware lookup with empty names', () => {
            const result = kernel.getMiddleware('');
            expect(result.regKey).toBe(''); // Should return dummy
        });

        it('should handle null/undefined provider lookups', () => {
            const result1 = kernel.getMiddleware('test', null as any);
            const result2 = kernel.getMiddleware('test', undefined);

            expect(result1.regKey).toBe('');
            expect(result2.regKey).toBe('');
        });

        it('should handle middleware registration with different host FynApp configurations', () => {
            const middleware1 = createMockMiddleware('config-test');
            middleware1.hostFynApp.name = 'host-app-1';
            middleware1.hostFynApp.version = '1.0.0';

            const middleware2 = createMockMiddleware('config-test');
            middleware2.hostFynApp.name = 'host-app-2';
            middleware2.hostFynApp.version = '2.0.0';
            middleware2.regKey = 'different-provider::config-test';

            kernel.registerMiddleware(middleware1);
            kernel.registerMiddleware(middleware2);

            const middlewares = kernel['runTime'].middlewares;
            expect(middlewares['config-test']).toBeDefined();
            expect(middlewares['different-provider::config-test']).toBeDefined();
        });
    });
});
