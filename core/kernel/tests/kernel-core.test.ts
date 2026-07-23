import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { FynEventTarget } from '../src/event-target.js';
import { createMockFynApp, createMockMiddleware } from './setup';
import type { FynAppEntry } from '../src/types.js';

// Create a concrete implementation for testing
class TestKernel extends FynMeshKernelCore {
    async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
        // Mock implementation of abstract method
        console.log(`Loading FynApp from ${baseUrl} with loadId: ${loadId}`);
    }
}

describe('FynMeshKernelCore', () => {
    let kernel: TestKernel;

    beforeEach(() => {
        kernel = new TestKernel();
    });

    describe('initialization', () => {
        it('should initialize with correct properties', () => {
            expect(kernel.version).toBe('1.0.0');
            expect(kernel.shareScopeName).toBe('fynmesh');
            expect(kernel.events).toBeInstanceOf(FynEventTarget);
        });

        it('should have empty runtime data initially', () => {
            expect(kernel['runTime'].appsLoaded).toEqual({});
            expect(kernel['runTime'].middlewares).toEqual({});
        });
    });

    describe('middleware management', () => {
        it('should register middleware correctly', () => {
            const mockMiddleware = createMockMiddleware('test-middleware');

            kernel.registerMiddleware(mockMiddleware);

            expect(kernel['runTime'].middlewares['test-middleware']).toBeDefined();
        });

        it('should get middleware by name', () => {
            const mockMiddleware = createMockMiddleware('test-middleware');
            kernel.registerMiddleware(mockMiddleware);

            const retrieved = kernel.getMiddleware('test-middleware');
            expect(retrieved).toBeDefined();
        });
    });

    describe('event system', () => {
        it('should have event target with correct methods', () => {
            expect(typeof kernel.events.on).toBe('function');
            expect(typeof kernel.events.once).toBe('function');
            expect(typeof kernel.events.addEventListener).toBe('function');
            expect(typeof kernel.events.dispatchEvent).toBe('function');
        });

        it('should handle events correctly', () => {
            const eventSpy = vi.fn();
            kernel.events.on('test-event', eventSpy);

            const event = new CustomEvent('test-event', { detail: { test: 'data' } });
            kernel.events.dispatchEvent(event);

            expect(eventSpy).toHaveBeenCalledWith(event);
        });
    });

    describe('utility methods', () => {
        it('should clean container names correctly', () => {
            const cleaned = kernel.cleanContainerName('@my-app/test-module');
            expect(cleaned).toBe('my_app_test_module');
        });

        it('should build fynapp URLs correctly', () => {
            const url = kernel['buildFynAppUrl']('http://example.com/app');
            expect(url).toBe('http://example.com/app/fynapp-entry.js');
        });

        it('should emit async events', async () => {
            const event = new CustomEvent('test-async', { detail: { async: true } });
            const result = await kernel.emitAsync(event);
            expect(typeof result).toBe('boolean');
        });
    });

    describe('runtime management', () => {
        it('should initialize runtime data', () => {
            const mockRuntimeData = {
                appsLoaded: { 'test-app': {} as any },
                middlewares: { 'test-mw': {} as any }
            };

            const result = kernel.initRunTime(mockRuntimeData);

            expect(result).toEqual(mockRuntimeData);
            expect(kernel['runTime']).toEqual(mockRuntimeData);
        });
    });
});
