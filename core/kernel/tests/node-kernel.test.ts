import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeKernel, createNodeKernel } from '../src/node-kernel.js';

describe('NodeKernel', () => {
    let kernel: NodeKernel;

    beforeEach(() => {
        kernel = new NodeKernel();
        vi.clearAllMocks();
    });

    describe('initialization', () => {
        it('should create a node kernel instance', () => {
            expect(kernel).toBeInstanceOf(NodeKernel);
            expect(kernel.version).toBe('1.0.0');
            expect(kernel.shareScopeName).toBe('fynmesh');
        });

        it('should have empty runtime initially', () => {
            expect(kernel['runTime'].appsLoaded).toEqual({});
            expect(kernel['runTime'].middlewares).toEqual({});
        });
    });

    describe('url building', () => {
        it('should build correct URL paths', () => {
            const url1 = kernel['buildFynAppUrl']('http://example.com/app');
            const url2 = kernel['buildFynAppUrl']('/local/path');
            const url3 = kernel['buildFynAppUrl']('https://cdn.example.com/modules');

            expect(url1).toBe('http://example.com/app/fynapp-entry.js');
            expect(url2).toBe('/local/path/fynapp-entry.js');
            expect(url3).toBe('https://cdn.example.com/modules/fynapp-entry.js');
        });

        it('should handle custom entry file names', () => {
            const url = kernel['buildFynAppUrl']('http://example.com/app', 'custom-entry.js');
            expect(url).toBe('http://example.com/app/custom-entry.js');
        });
    });

    describe('error handling', () => {
        it('should handle invalid URLs gracefully', async () => {
            // Test with an invalid URL that will fail during dynamic import
            await expect(kernel.loadFynApp('invalid-url'))
                .rejects.toThrow();
        });
    });
});

describe('createNodeKernel', () => {
    it('should create and initialize a node kernel', () => {
        const kernel = createNodeKernel();

        expect(kernel).toBeInstanceOf(NodeKernel);
        expect(kernel['runTime'].appsLoaded).toEqual({});
        expect(kernel['runTime'].middlewares).toEqual({});
    });

    it('should return different instances on multiple calls', () => {
        const kernel1 = createNodeKernel();
        const kernel2 = createNodeKernel();

        expect(kernel1).not.toBe(kernel2);
        expect(kernel1).toBeInstanceOf(NodeKernel);
        expect(kernel2).toBeInstanceOf(NodeKernel);
    });
});
