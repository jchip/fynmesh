/**
 * fynmesh kernel
 * Core runtime for the fynmesh microfrontend framework
 */

// Export types
export * from './types';

// Export core components
export { FynMeshKernelCore } from './kernel-core';
export { BrowserKernel, createBrowserKernel } from './browser-kernel';
export { NodeKernel, createNodeKernel } from './node-kernel';

// Smart platform detection and default export
export function createKernel() {
    if (typeof window !== 'undefined' && typeof globalThis !== 'undefined') {
        // Browser environment
        const { createBrowserKernel } = require('./browser-kernel');
        return createBrowserKernel();
    } else {
        // Node.js environment
        const { createNodeKernel } = require('./node-kernel');
        return createNodeKernel();
    }
}

// Legacy export for backward compatibility
export { createKernel as Kernel };
