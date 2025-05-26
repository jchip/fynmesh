/**
 *  entry point for bundling and distributing the kernel in IIFE format for loading
 *  in the browser
 */
import { browserKernel } from './browser-kernel';

// The browser kernel is already initialized and attached to globalThis
// This file just ensures it's available for IIFE builds
export { browserKernel as fynMeshKernel };
